const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
// Render বা অন্য যেকোনো হোস্টিংয়ের এনভায়রনমেন্ট পোর্ট হ্যান্ডেল করার জন্য
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// মূল রুট/হোমপেজ
app.get('/', (req, res) => {
    res.json({ message: "Pinterest Video Downloader API is running successfully!" });
});

// ভিডিও ডাউনলোডার API এন্ডপয়েন্ট
app.get('/api/download', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).json({ error: "Please provide a Pinterest video URL. Example: ?url=https://pin.it/xxxxx" });
    }

    try {
        // ১. Pinterest পেজের HTML ডেটা ফেচ করা (Render-এর জন্য হেডার্স আপডেট করা হয়েছে)
        const response = await axios.get(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: 10000 // ১০ সেকেন্ডের মধ্যে রেসপন্স না আসলে রিকোয়েস্ট ক্যানসেল হবে যেন Render-এ প্রসেস আটকে না থাকে
        });

        const $ = cheerio.load(response.data);
        
        // ২. HTML থেকে <video> ট্যাগ বা স্ক্রিপ্ট ট্যাগ থেকে ভিডিওর আসল URL খোঁজা
        let directVideoUrl = $('video').attr('src');

        // যদি সরাসরি <video> ট্যাগে না পাওয়া যায়, তবে স্ক্রিপ্ট ট্যাগ চেক করা
        if (!directVideoUrl) {
            const scriptTag = $('script[type="application/ld+json"]').html();
            if (scriptTag) {
                try {
                    const jsonData = JSON.parse(scriptTag);
                    if (jsonData.video && jsonData.video.contentUrl) {
                        directVideoUrl = jsonData.video.contentUrl;
                    } else if (Array.isArray(jsonData)) {
                        const videoObj = jsonData.find(item => item.video);
                        if (videoObj && videoObj.video.contentUrl) directVideoUrl = videoObj.video.contentUrl;
                    }
                } catch (e) {
                    console.error("JSON parse error for script tag");
                }
            }
        }

        // যদি স্ক্রিপ্ট ট্যাগেও না পাওয়া যায়, তবে মেটা ট্যাগ চেক করা
        if (!directVideoUrl) {
            directVideoUrl = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content');
        }

        // ৩. রেজাল্ট রিটার্ন করা
        if (directVideoUrl) {
            // m3u8 লিংক থাকলে সেটাকে সরাসরি mp4 এ কনভার্ট করার চেষ্টা
            const finalDownloadUrl = directVideoUrl.replace('/hls/', '/720p/').replace('.m3u8', '.mp4');
            
            return res.json({
                success: true,
                title: $('meta[property="og:title"]').attr('content') || "Pinterest Video",
                thumbnail: $('meta[property="og:image"]').attr('content') || "",
                download_url: finalDownloadUrl
            });
        } else {
            return res.status(404).json({ success: false, error: "Video URL not found. Make sure it's a video link, not an image." });
        }

    } catch (error) {
        console.error("Error fetching Pinterest URL:", error.message);
        return res.status(500).json({ success: false, error: "Something went wrong or the request was blocked by Pinterest." });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
