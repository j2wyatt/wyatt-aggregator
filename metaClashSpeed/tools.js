const axios = require('axios');

// gist 基础参数
const GITHUB_TOKEN = process.env.GIST_PAT;
const GIST_ID = process.env.GIST_LINK.replace("j2wyatt/", "")
const FILE_NAME = 'clashspeed.yaml';

/**
 * 过滤的节点, 保存到 gist 文件
 *
 * */
exports.updateClashSpeedFile = async function (resStr) {
    await updateGistFile(resStr, FILE_NAME)
}

// 更新 gist
async function updateGistFile(newContent, fileName) {
    try {
        // Update the file content
        const updatedFiles = {
            [fileName]: {
                content: newContent
            }
        };

        // Send a PATCH request to update the Gist
        const updateResponse = await axios.patch(`https://api.github.com/gists/${GIST_ID}`, {
            files: updatedFiles
        }, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
        });

        console.log('Gist file updated successfully');
    } catch (error) {
        console.error('Error:', error.message || error);
    }
}
// 用来查看打印数据
async function urlConsole(str, axios) {
    await postData(str, axios);
}

async function postData(str, axios) {
    try {
        const response = await axios.post('http://127.0.0.1:3000/', {
            message: str
        });

        console.log('POST 请求成功：', response.data);
    } catch (error) {
        console.error('POST 请求失败：', error);
    }
}
