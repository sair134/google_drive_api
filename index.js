const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const app = express();
const fs = require('fs');
const PORT = 5000;
const path = require("path");
const axios = require('axios')
const cookieParser = require("cookie-parser");
require('dotenv').config()
const jwt = require("jsonwebtoken");
// Allow cross-origin requests
app.use(express.json()); // Parse JSON body
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded data
app.use(cookieParser());
app.use(cors({ origin: "http://localhost:3000", credentials: true }));


// Authenticate with the Google Drive API
const auth = new google.auth.GoogleAuth({
  keyFile: "cred.json", // Path to your service account key JSON
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});




const drive = google.drive({ version: 'v3', auth })
const JWT_SECRET = process.env.JWT_secret

async function fetchUsersFromDrive() {
  try {
    const fileId = process.env.creds_file_id
  
    const response = await drive.files.get({ fileId: fileId, alt: "media" });
    
    const data = response.data.users; // Extract users array
    return data
  } catch (error) {
    console.error("Error fetching users:", error);
    return [];
  }
}

app.post("/login", async (req, res) => {
  try {
    console.log('calling')
    const { email, password } = req.body;
    console.log(req.body)

    // Fetch stored credentials from Google Drive
    const users = await fetchUsersFromDrive();
    const user = users.find((u) => u.username === email);  
    if (!user) return res.status(400).json({ message: "Invalid credentials" });
  
    // Compare passwords
    const isMatch = password == user.password
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    // Generate JWT Token
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "24h" });

    // Store token in cookies
    res.cookie("token", token, { httpOnly: true, secure: false, sameSite: "Lax", path : "/", maxAge: 1000*60*60*24 }); // Set `secure: true` in production
    res.json({ message: "Login successful", username: user.username, access:user.access });
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Something went wrong" });
  }
});

const authMiddleware = (req, res, next) => {
  console.log('middleware')
  const token = req.cookies.token;
  console.log(token)
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};


app.get("/verifyToken", authMiddleware, (req, res)=>{

  res.json({ message: "Access granted" })
})



app.post("/logout", (req, res) => {
  try{
  res.clearCookie("token", { httpOnly: true, secure: false, sameSite: 'Lax', path: '/' });
  res.json({ message: "Logged out successfully" });
  }catch(e){
    res.status(500).json({message: 'Something went wrong'})
  }
});


app.get("/files",authMiddleware, async (req, res) => {
  try {
    const drive = google.drive({ version: "v3", auth });
    // List files in Google Drive
  const folderId = '1-BfwOnKZokocSG-J7T1oMKAhsTVhKDGH'

  const query = `'${folderId}' in parents and trashed=false`
    const response = await drive.files.list({
      q: query,
      pageSize: 10,
      fields: "files(id, name, mimeType, parents)",
    });

    let allFiles = {}
    const folders = await response.data.files;
    for(let folder of folders){
 
      try{const resp = await drive.files.list({
        q:`'${folder.id}' in parents and trashed=false`,
        fields:'files(id, name, mimeType, parents)'
      })
     
      const files = await resp.data.files

        allFiles[folder.name] = files}
        catch(e){
          console.error('Somethin went wrong')
        }
    
        }

        


    res.status(200).json(allFiles);
  } catch (error) {
    console.error("Error fetching files:", error);
    res.status(500).send("Error fetching files");
  }
});


app.get('/books',authMiddleware, async(req, res)=>{
  try {
    const drive = google.drive({ version: "v3", auth });
    // List files in Google Drive
    const response = await drive.files.list({
      q: "'1_z_7Lfq0PEg4Hw3_lfyMdcP7mlSBSlyo' in parents",
      pageSize: 10,
      fields: "files(id, name, mimeType, parents)",
    });
    res.status(200).json(response.data.files);
  } catch (error) {
    console.error("Error fetching files:", error);
    res.status(500).send("Error fetching files");
  }
})



app.get("/download/:fileId",authMiddleware, async (req, res) => {
    try {
      const drive = google.drive({ version: "v3", auth });
      const fileId = req.params.fileId;
  
      const result = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "stream" }
      );
  
      // Pipe the file content directly to the response
      result.data
        .on("end", () => {
          console.log("File download complete.");
        })
        .on("error", (err) => {
          console.error("Error downloading file:", err);
          res.status(500).send("Error downloading file");
        })
        .pipe(res);
    } catch (error) {
      console.error("Error fetching file:", error);
      res.status(403).send("Access denied");
    }
  });





  app.get('/size/:fileId', async (req, res) => {
    const fileId = req.params.fileId;
    const accessToken = await auth.getAccessToken();

    // Get file metadata to determine size
    const metadataUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=size`;
    const metadataResponse = await axios.get(metadataUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    res.json({ size: parseInt(metadataResponse.data.size) });
});

  app.get('/url/:fileId',authMiddleware, async(req,res)=>{
    const fileId = req.params.fileId;
    const start_ti = Date.now()
    const accessToken = await auth.getAccessToken();
    const end_ti = Date.now()
    console.log(end_ti - start_ti)

    // Get file metadata to determine size
    const time2 = Date.now()
    console.log(time2-end_ti)
    // Parse range header from client
    const range = req.headers.range;
    // if (!range) {
    //     return res.status(400).send('Requires Range header');
    // }
    const metadataUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=size`;
    const metadataResponse = await axios.get(metadataUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    const fileSize = metadataResponse.data.size

    const CHUNK_SIZE = 10 ** 6; // 1 MB
    const start = Number(range.replace(/\D/g, ''));
    const end = Math.min(start + CHUNK_SIZE, fileSize - 1);

    // Set headers for partial content
    res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': 'video/mp4',
    });

    // Stream the video chunk from Google Drive
    const mediaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const response = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, Range: `bytes=${start}-${end}` },
        responseType: 'stream',
    });

    const time3= Date.now()
    console.log(time3-time2)

    // Pipe the chunk to the client
    response.data.pipe(res);
});








app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
