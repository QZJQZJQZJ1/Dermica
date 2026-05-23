require('dotenv').config();

const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;
const COLLECTION_NAME = "dermica_verification_codes";

let db;


MongoClient.connect(MONGO_URI)
    .then(client => {
        db = client.db(DB_NAME);
        console.log("MongoDB Atlas 连接成功！");

        app.listen(port, () => {
            console.log(`服务已启动！测试链接: http://localhost:${port}/anti_fake/ElequeryEn?code=43097`);
        });
    })
    .catch(err => {
        console.error("MongoDB 连接失败，服务未启动:", err);
    });


app.use(express.static(path.join(__dirname, 'public')));

app.get('/anti_fake/ElequeryEn', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

function getFormattedDate() {
    const d = new Date();
    return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, '0') + "-" +
        String(d.getDate()).padStart(2, '0') + " " +
        String(d.getHours()).padStart(2, '0') + ":" +
        String(d.getMinutes()).padStart(2, '0') + ":" +
        String(d.getSeconds()).padStart(2, '0');
}

app.get('/api/verify', async (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.json({ State: "-1", Message: "未提供验证码" });
    }

    try {
        const collection = db.collection(COLLECTION_NAME);
        const doc = await collection.findOne({ code: code });

        if (!doc) {

            return res.json({ State: "-1", Message: "该验证码不存在" });
        }

        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (ip.includes(',')) ip = ip.split(',')[0].trim();
        if (ip === '::1' || ip === '127.0.0.1') ip = '';

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

app.listen(port, () => {
    console.log(`服务已启动！测试链接: http://localhost:${port}/anti_fake/ElequeryEn?code=43097`);
});