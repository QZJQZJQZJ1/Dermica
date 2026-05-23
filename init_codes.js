const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// 1. 配置参数
// 请将这里的连接字符串替换为你的 Atlas 真实连接字符串
const MONGO_URI = "mongodb+srv://qzjcs_db_user:hYYZBv8lWK4OEYuv@cluster0.u9hjnhe.mongodb.net/verification_db?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "verification_db"; // 你的数据库名称
const COLLECTION_NAME = "dermica_verification_codes"; // 你的集合名称
const LOCAL_FILE_NAME = "codes_backup_test.json"; // 本地保存的文件名

const TOTAL_CODES = 1000;
const CODE_LENGTH = 5;

async function generateAndInsertData() {
    console.log(`[1/4] 开始生成 ${TOTAL_CODES} 个 ${CODE_LENGTH} 位验证码...`);
    const codesSet = new Set();

    // 生成不重复的 16 位纯数字验证码
    while (codesSet.size < TOTAL_CODES) {
        let code = '';
        for (let i = 0; i < CODE_LENGTH; i++) {
            code += Math.floor(Math.random() * 10).toString();
        }
        codesSet.add(code);
    }

    // 构建 MongoDB 文档对象
    const documents = Array.from(codesSet).map(code => ({
        code: code,
        validationCount: 0,
        firstValidationTime: null,
        firstValidationAddress: null
    }));
    console.log("验证码生成完毕！");

    // 2. 保存到本地文件
    console.log(`[2/4] 正在将数据备份到本地文件: ${LOCAL_FILE_NAME}...`);
    const filePath = path.join(__dirname, LOCAL_FILE_NAME);
    // 使用 JSON 格式保存，保持与 MongoDB BSON 结构的一致性
    fs.writeFileSync(filePath, JSON.stringify(documents, null, 2), 'utf8');
    console.log(`本地文件保存成功，路径: ${filePath}`);

    // 3. 连接 Atlas 并插入数据
    console.log("[3/4] 正在连接 MongoDB Atlas...");
    const client = new MongoClient(MONGO_URI);

    try {
        await client.connect();
        console.log("Atlas 连接成功！");

        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        console.log("开始向 Atlas 批量插入数据...");
        const insertResult = await collection.insertMany(documents);
        console.log(`成功插入 ${insertResult.insertedCount} 条记录！`);

        console.log("[4/4] 正在为 code 字段创建唯一索引...");
        await collection.createIndex(
            { code: 1 },
            { unique: true, background: true }
        );
        console.log("唯一索引创建成功！全部流程执行完毕。");

    } catch (error) {
        console.error("操作 Atlas 数据库时发生错误:", error);
    } finally {
        // 无论成功还是失败，最后都要关闭数据库连接
        await client.close();
        console.log("数据库连接已关闭。");
    }
}

// 执行主函数
generateAndInsertData();