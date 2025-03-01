const express = require("express");
const cors = require("cors");
const youtubedl = require("youtube-dl-exec");
const path = require("path");
const fs = require("fs");
const app = express();

app.use(
  cors({
    origin: ["https://app-y-tto-mp-3-fe.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition", "Content-Type", "Content-Length"],
    credentials: true,
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

// Tạo thư mục tạm để lưu file
const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

app.post("/download", async (req, res) => {
  res.send(`đây là backend`);
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
    })
      .then((output) => console.log("output download>>>", output))
      .catch((error) => console.error("Error in youtube-dl-exec:", error));

    // console.log(outputPath);
    // console.log(fs.existsSync(outputPath));
    // Kiểm tra file có tồn tại không
    if (!fs.existsSync(outputPath)) {
      throw new Error("File không được tạo thành công");
    }
    console.log("<<<<<<<<<<>>>>>>>>>>");
    const stat = fs.statSync(outputPath);

    // Set headers
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Type", "video/webm");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.webm"`);
    console.log("<<<<<<<<<<>>>>>>>>>>");
    // Stream file to response
    const stream = fs.createReadStream(outputPath);

    // Xử lý các sự kiện của stream
    stream.on("error", (error) => {
      console.error("Stream error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Lỗi khi đọc file" });
      }
      // Cleanup file nếu có lỗi
      if (outputPath && fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    });
    console.log("check>>>>>>>", res.headersSent);
    stream.on("end", () => {
      // Cleanup file sau khi stream hoàn tất
      if (outputPath && fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    });

    // Pipe stream to response
    stream.pipe(res);
  } catch (error) {
    console.error("Error:");
    // Cleanup file nếu có lỗi
    if (outputPath && fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    res.status(500).json({ error: "Có lỗi xảy ra khi tải file: " + error });
  }
});

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
