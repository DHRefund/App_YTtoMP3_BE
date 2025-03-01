const express = require("express");
const cors = require("cors");
const youtubedl = require("youtube-dl-exec");
const path = require("path");
const os = require("os");
const fs = require("fs");
const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition", "Content-Type", "Content-Length"],
    credentials: false,
    optionsSuccessStatus: 200,
  })
);
app.use(express.json());

// Hàm mã hóa tên file
function encodeRFC5987ValueChars(str) {
  return encodeURIComponent(str)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A")
    .replace(/%(?:7C|60|5E)/g, unescape);
}

// Sử dụng thư mục temp của hệ thống
const tempDir = path.join(os.tmpdir(), "youtube-dl-temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

app.get("/", (req, res) => {
  res.json({ status: "Server is running" });
});

app.post("/download", async (req, res) => {
  let outputPath = null;

  try {
    const { url } = req.body;
    console.log("Processing URL:", url);

    // Validate URL
    if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
      return res.status(400).json({ error: "URL không hợp lệ" });
    }

    // Lấy thông tin video
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
    });
    console.log("info:", info.title);

    // Tạo tên file an toàn
    const safeTitle = encodeRFC5987ValueChars(info.title);

    outputPath = path.join(tempDir, `${safeTitle}.webm`);
    console.log("Output path:", outputPath);

    // Download và convert sang MP3
    await youtubedl(url, {
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: 0,
      output: outputPath,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        "referer:youtube.com",
        "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      ],
    });

    // Kiểm tra file có tồn tại không
    if (!fs.existsSync(outputPath)) {
      throw new Error("File không được tạo thành công");
    }

    const stat = fs.statSync(outputPath);

    // Set headers
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Type", "video/webm");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.webm"`);

    // Stream file to response
    const stream = fs.createReadStream(outputPath);

    // Xử lý các sự kiện của stream
    stream.on("error", (error) => {
      console.error("Stream error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Lỗi khi đọc file" });
      }
      cleanup(outputPath);
    });

    stream.on("end", () => {
      cleanup(outputPath);
    });

    // Pipe stream to response
    stream.pipe(res);
  } catch (error) {
    console.error("Error:", error);
    cleanup(outputPath);
    res.status(500).json({ error: "Có lỗi xảy ra khi tải file: " + error.message });
  }
});

// Hàm cleanup
function cleanup(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log("Cleaned up file:", filePath);
    } catch (err) {
      console.error("Error cleaning up file:", err);
    }
  }
}

// Cleanup temp directory on startup
fs.readdir(tempDir, (err, files) => {
  if (err) console.error("Error reading temp dir:", err);
  else {
    files.forEach((file) => {
      fs.unlink(path.join(tempDir, file), (err) => {
        if (err) console.error("Error deleting temp file:", err);
      });
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
});
