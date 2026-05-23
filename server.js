require('dotenv').config();

const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const axios = require('axios');

const app = express();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;
const COLLECTION_NAME = "dermica_verification_codes";

// 配置静态资源目录
app.use(express.static(path.join(__dirname, 'public')));

// Serverless 模式下的数据库缓存连接
let cachedDb = null;
async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }
    const client = await MongoClient.connect(MONGO_URI);
    cachedDb = client.db(DB_NAME);
    return cachedDb;
}

// 页面路由
app.get('/anti_fake/ElequeryEn', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 获取格式化时间
function getFormattedDate() {
    const d = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);

    return d.getUTCFullYear() + "-" +
        String(d.getUTCMonth() + 1).padStart(2, '0') + "-" +
        String(d.getUTCDate()).padStart(2, '0') + " " +
        String(d.getUTCHours()).padStart(2, '0') + ":" +
        String(d.getUTCMinutes()).padStart(2, '0') + ":" +
        String(d.getUTCSeconds()).padStart(2, '0');
}

// API 路由
app.get('/api/verify', async (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.json({ State: "-1", Message: "未提供验证码" });
    }

    try {
        // 每次请求进来时获取数据库连接
        const db = await connectToDatabase();
        const collection = db.collection(COLLECTION_NAME);

        const doc = await collection.findOne({ code: code });
        if (!doc) {
            return res.json({ State: "-1", Message: "该验证码不存在" });
        }

        // 获取 IP 地址
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (ip.includes(',')) ip = ip.split(',')[0].trim();
        if (ip === '::1' || ip === '127.0.0.1') ip = '';

        // 解析地理位置
        let address = "未知位置";
        try {
            const geoResponse = await axios.get(`http://ip-api.com/json/${ip}?lang=zh-CN`);
            if (geoResponse.data && geoResponse.data.status === 'success') {
                address = `${geoResponse.data.country} ${geoResponse.data.regionName} ${geoResponse.data.city}`;
            }
        } catch (e) {
            console.error("IP 位置解析失败");
        }

        if (doc.validationCount === 0) {
            // 首次验证
            const currentTime = getFormattedDate();
            await collection.updateOne(
                { code: code },
                {
                    $set: {
                        validationCount: 1,
                        firstValidationTime: currentTime,
                        firstValidationAddress: address
                    }
                }
            );
            return res.json({ State: "1" });
        } else {
            // 多次验证
            const newCount = doc.validationCount + 1;
            await collection.updateOne(
                { code: code },
                {
                    $set: { validationCount: newCount }
                }
            );
            return res.json({
                State: "0",
                Times: newCount,
                FirstDate: doc.firstValidationTime,
                RecordList: [{ Address: doc.firstValidationAddress }]
            });
        }
    } catch (error) {
        console.error("查询处理异常:", error);
        res.status(500).json({ State: "-2", Message: "服务器内部错误" });
    }
});

// 关键步骤：导出 app 给 Vercel 调用
module.exports = app;