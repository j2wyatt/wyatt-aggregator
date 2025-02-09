var Clash = require('clash-proxy')
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { spawn } = require('child_process');
const yaml = require('yaml');
const os = require('os')
const moment = require('moment');
const { DownloaderHelper } = require('node-downloader-helper');
const tool = require('./tools.js')


/**
 * ======================================
 *  BUG 温馨提示, 这个是 github 版本的测速脚本
 * ======================================
 * 
 * - 脚本的目的是筛选可以使用的机场节点
 * - 流程
 *   - 请求到机场订阅文件
 *   - 启动 clash，指定订阅文件
 *   - 依次使用节点作为代理，访问墙外的网站
 *   - 如果访问成功，保存节点
 *   - 制作新的订阅文件
 * - 开发
 *   - clash 的启动端口可以不是 7890, 这样就不会干扰原来的 clash
 *   - 首先要能在树莓派上运行
 *   - 有必要的话可以做成 github action
 * - 2024-12-22
 *   - 当天制作完成
 * - 2024-12-23
 *   - 通过验证的节点太多了, 我怀疑这个脚本的可行性
 *   - 想要增加一种验证方式, 下载一个 10MB 的文件
 *   - 想要的效果是, 最终的结果随便指定一个就能上网,不需要翻找可用的节点
 *   - 有可能会出现连接 clash 一直有错误输出，可能是上次执行时，clash 没有关闭
 *   - 只要这次关闭了，下次就不会有了
 *   - fuck，增加了下载 github 文件的测试，还是有一半的节点能用，fuck
 *   - 那为什么我平板上选择的时候就不行了
 *   - 只有一个办法了，那就是没小时跑一次脚本，做一次筛选
 *   - 先在树莓派上跑，看看效果，以后放到 github 上
 * - 2024-12-24
 *   - 这次把脚本添加到 github 执行
 *   - 进行对应改造，增加 workflow 脚本
 *   - 启动 x64 的 clash 版本，clash 启动前增加执行权限
 *   - 文件的保存路径要改变
 *   - 最后生成的文件，要保存到 gist
 *   - 我向 clash 文件里加里国加速的 geoip 的 db 文件
 *   - 可能在国外访问不了，会导致启动失败
 *   - 最后的结果要保存到文件,可以网络访问的 gist
 * - 2024-12-25
 *   - 最终的文件里加上 geo 链接，使用国内加速的网站
 *
 * 
 * 
 */

const TIMEOUT = 15 * 1000; // 10 seconds
const MIN_DELAY = 0;

const CLASH_PORT = 7888
const EXT_PORT = 7889;
// const CLASH_PORT = 7892
// const EXT_PORT = 9090;

// const mySub = "https://gh-proxy.com/https://gist.githubusercontent.com/j2wyatt/f5754c9d3fa49a8efb017fb7647dff38/raw/clashless.yaml"
const mySub = "https://gh-proxy.com/https://gist.githubusercontent.com/j2wyatt/f5754c9d3fa49a8efb017fb7647dff38/raw/clashall.yaml"
const targetUrl = "https://u3c3.com"
let goodParts = []
let clashProcess = null;
const MAX_GOOD = 40

// 启动 clash-mac 服务
function startClashService() {
    return new Promise((resolve, reject) => {
        const configPath = path.join(__dirname, 'conf', 'sub.yaml');
        if (os.arch() == "arm64") {
            clashProcess = spawn('./bin/mihomo-pi', ['-f', configPath]);
        } else if (os.type() == 'Linux') {
            // github
            clashProcess = spawn('./bin/mihomo-github', ['-f', configPath]);
        } else {
            clashProcess = spawn('./bin/mihomo-mac', ['-f', configPath]);
        }

        clashProcess.stdout.on('data', (data) => {
            // console.log('Clash 输出:', data.toString());
        });

        clashProcess.stderr.on('data', (data) => {
            console.error('Clash 错误:', data.toString());
        });

        clashProcess.on('error', (error) => {
            console.error('启动 Clash 失败:', error);
            reject(error);
        });

        // 给 clash 一些启动时间
        setTimeout(() => {
            if (clashProcess.pid) {
                console.log('Clash 服务已启动，PID:', clashProcess.pid);
                resolve(true);
            } else {
                reject(new Error('Clash 启动失败'));
            }
        }, 2000);
    });
}

// 关闭 clash-mac 服务
function stopClashService() {
    return new Promise((resolve) => {
        if (clashProcess) {
            clashProcess.kill();
            clashProcess = null;
            console.log('Clash 服务已停止');
        }
        resolve();
    });
}

// 新增：从配置文件获取代理组名称的函数
async function getProxyGroupNames() {
    const confPath = path.join(__dirname, 'conf', 'sub.yaml');
    try {
        const fileContent = fs.readFileSync(confPath, 'utf8');
        const config = yaml.parse(fileContent);
        return config['proxy-groups'].map(group => group.name);
    } catch (error) {
        console.error("获取代理组名称时出错:", error);
        return [];
    }
}

// 机场测速，然后依次尝试节点可用性
async function checkSingleAirWork() {
    // 稍等它一下
    await sleep(10 * 1000)
    console.log("测试节点的可用性: 访问 " + targetUrl);
    const clash = Clash({ secret: '', api: `http://127.0.0.1:${EXT_PORT}` });
    try {
        const proxies = await clash.proxies();
        const targetGroup = proxies['🔰 节点选择'].all;
        // 获取代理组名称
        const proxyGroups = await getProxyGroupNames();
        // 依次测速
        for (let i = 0; i < targetGroup.length; i++) {
            await sleep(500);
            const delayProx = targetGroup[i];

            // 避免指定代理组
            if (proxyGroups.includes(delayProx)) {
                console.log("跳过代理组:", delayProx);
                continue;
            }
            console.log("")
            console.log(`尝试节点 [${i + 1}/${targetGroup.length}]：${delayProx}`);

            let delay = {};
            const result = await interruptibleFunction(async () => {
                delay = await clash.delay(encodeURI(delayProx));
            });
            console.log('delay', delay);
            // 只要不超时，就可以试一试
            if (delay.delay && delay.delay > MIN_DELAY) {
                const switchGood = await clash.switch(encodeURI('🔰 节点选择'), delayProx);
                if (switchGood) {
                    await sleep(2000);
                    try {
                        const res = await makeRequest(targetUrl);
                        console.log("返回值: " + res.status);

                        if (res && res.status === 200) {
                            let downfileGood = false;
                            try {
                                const testFileUrl = 'https://github.com/noimank/tvbox/releases/download/202406/jiyueTV.apk';
                                const downloadFolder = path.join(__dirname, 'downloads');

                                // 确保下载目录存在
                                if (!fs.existsSync(downloadFolder)) {
                                    fs.mkdirSync(downloadFolder, { recursive: true });
                                }

                                downfileGood = await downloadFile(testFileUrl, downloadFolder, {
                                    httpsRequestOptions: {
                                        agent: new HttpsProxyAgent(`http://127.0.0.1:${CLASH_PORT}`),
                                    },
                                    fileName: "app.apk",
                                    timeout: TIMEOUT,
                                    override: true
                                });
                            } catch (err) {
                                console.log("下载测试过程出错:", err);
                                downfileGood = false;
                            }

                            if (downfileGood) {
                                console.log(`============= 节点可用[${goodParts.length}]: ", delayProx, " ================`);
                                console.log("===================================================\n\n");
                                goodParts.push(delayProx);
                                if (goodParts.length >= MAX_GOOD) {
                                    return true
                                }
                            }
                        }
                    } catch (err) {
                        console.log("请求出错: " + err.message);
                    }
                }
            } else {
                console.log("节点不可用: ", delayProx);
            }
        }
        console.log("所有节点测试完成");
    } catch (error) {
        if (error.message === 'Operation aborted') {
            console.error('检测到代理切换超时');
        } else {
            console.error('发生错误:', error);
        }
        return false;
    }
}

// 保存订阅文件
async function downloadSubscription() {
    console.log("开始下载订阅文件");

    const confDir = path.join(__dirname, 'conf');
    if (!fs.existsSync(confDir)) {
        fs.mkdirSync(confDir, { recursive: true });
    }

    try {
        const response = await makeRequest(mySub, false); // 不使用代理下载订阅文件
        if (response.status === 200) {
            const filePath = path.join(confDir, 'sub.yaml');
            fs.writeFileSync(filePath, response.data);
            console.log("订阅文件已保存到:", filePath);
            return true;
        } else {
            console.log("下载订阅文件失败，状态码:", response.status);
            return false;
        }
    } catch (error) {
        console.error("下载订阅文件时出错:", error);
        return false;
    }
}

// 防止一项任务执行超时，中断函数执行
function interruptibleFunction(fn) {
    let timeoutId;
    let isTimedOut = false;

    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            isTimedOut = true;
            reject(new Error('检测到代理切换超时，结束函数执行'));
        }, TIMEOUT);
    });

    const fnPromise = new Promise(async (resolve) => {
        while (!isTimedOut) {
            try {
                const result = await fn();
                clearTimeout(timeoutId);
                resolve(result);
                return;
            } catch (error) {
                console.error('发生错误，重试中...', error);
                // 可以在这里添加重试延迟
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    });
    return Promise.race([fnPromise, timeoutPromise]);
}

var sleep = function(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 创建 axios 请求配置
 * @param {number} port 代理端口
 * @returns {Object} axios配置对象
 */
async function makeAxiosOption(port = CLASH_PORT) {
    const httpsAgent = new HttpsProxyAgent(`http://127.0.0.1:${port}`);
    return {
        proxy: false,
        httpsAgent,
        timeout: TIMEOUT,
        validateStatus: function(status) {
            return status >= 200 && status < 300; // 认值
        },
    };
}

// 替换原来的 directCrawler 函数
async function makeRequest(url, useProxy = true) {
    try {
        const config = useProxy ? await makeAxiosOption() : {};
        const response = await axios.get(url, config);
        return response;
    } catch (error) {
        throw error;
    }
}

// 修改 clash 配置文件
async function modifyClashConfig() {
    console.log("开始修改配置文件");
    const confPath = path.join(__dirname, 'conf', 'sub.yaml');

    try {
        // 读取并解析YAML
        const fileContent = fs.readFileSync(confPath, 'utf8');
        const config = yaml.parse(fileContent);

        // 修改端口配置
        config.port = CLASH_PORT;
        config['external-controller'] = ":" + EXT_PORT;

        // 添加 geox-url 配置
        // config['geox-url'] = {
        //     'geoip': 'https://hub.gitmirror.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat',
        //     'geosite': 'https://hub.gitmirror.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
        //     'mmdb': 'https://hub.gitmirror.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb'
        // };

        // 将修改后的配置写入新文件
        fs.writeFileSync(confPath, yaml.stringify(config));
        console.log("配置文件修改完成，已保存到:", confPath);
        return true;
    } catch (error) {
        console.error("修改配置文件时出错:", error);
        return false;
    }
}

// 新增：根据可用节点过滤配置文件
async function filterClashConfig(goodNodes) {
    console.log("开始过滤配置文件，保留可用节点");
    const confPath = path.join(__dirname, 'conf', 'sub.yaml');
    let outputPath = path.join(__dirname, 'conf', 'out.yaml');

    try {
        const fileContent = fs.readFileSync(confPath, 'utf8');
        const config = yaml.parse(fileContent);

        // 获取所有代理组名称
        const proxyGroups = config['proxy-groups'].map(group => group.name);

        // 过滤 proxies 列表
        config.proxies = config.proxies.filter(proxy =>
            goodNodes.includes(proxy.name) || proxyGroups.includes(proxy.name) ||
            proxy.name == 'REJECT' || proxy.name == 'DIRECT'
        );

        // 过滤每个代理组中的代理列表
        config['proxy-groups'] = config['proxy-groups'].map(group => {
            if (Array.isArray(group.proxies)) {
                group.proxies = group.proxies.filter(proxyName =>
                    goodNodes.includes(proxyName) || proxyGroups.includes(proxyName) ||
                    proxyName == 'REJECT' || proxyName == 'DIRECT'
                );
            }
            return group;
        });

        // 添加 geox-url 配置
        config['geox-url'] = {
            'geoip': 'https://hub.gitmirror.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat',
            'geosite': 'https://hub.gitmirror.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
            'mmdb': 'https://hub.gitmirror.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb'
        };
        // 保存过滤后的配置
        fs.writeFileSync(outputPath, yaml.stringify(config));
        console.log("已保存过滤后的配置文件到:", outputPath);
        return yaml.stringify(config);
    } catch (error) {
        console.error("过滤配置文件时出错:", error);
        return false;
    }
}

// 修改下载文件的函数
async function downloadFile(url, downloadFolder, options = {}) {
    return new Promise((resolve, reject) => {
        const dl = new DownloaderHelper(url, downloadFolder, options);

        let hasEnded = false;

        // 设置超时
        const timeout = setTimeout(() => {
            if (!hasEnded) {
                dl.stop();
                reject(new Error('Download timeout'));
            }
        }, TIMEOUT); // 20秒超时

        dl.on('end', () => {
            hasEnded = true;
            clearTimeout(timeout);
            console.log('下载完成');
            resolve(true);
        });

        dl.on('error', (err) => {
            hasEnded = true;
            clearTimeout(timeout);
            console.log('下载失败:', err);
            resolve(false); // 改用 resolve(false) 而不是 reject
        });

        try {
            dl.start().catch(err => {
                hasEnded = true;
                clearTimeout(timeout);
                console.log('启动下载失败:', err);
                resolve(false);
            });
        } catch (err) {
            hasEnded = true;
            clearTimeout(timeout);
            console.log('启动下载失败:', err);
            resolve(false);
        }
    });
}

// 修改 main 函数
async function main() {
    const now = moment();
    const formattedDate = now.format('YYYY-MM-DD HH:mm:ss');
    console.log(formattedDate);
    try {
        // 首先下载订阅文件
        const downloaded = await downloadSubscription();
        if (!downloaded) {
            console.log("无法继续执行，订阅文件下载失败");
            return;
        }

        // 修改配置文件
        const modified = await modifyClashConfig();
        if (!modified) {
            console.log("无法继续执行，配置文件修改失败");
            return;
        }

        // 启动 clash 服务
        await startClashService();

        // 检查节点
        await checkSingleAirWork().catch(console.error);
        console.log("goodParts", goodParts);

        // 新增：过滤配置文件
        if (goodParts.length > 0) {
            let resStr = await filterClashConfig(goodParts);
            await tool.updateClashSpeedFile(resStr)
        } else {
            console.log("没有找到可用节点，跳过配置文件过滤");
        }

        // 停止 clash 服务
        await stopClashService();
        const lastTime = moment();
        const lastTimeStr = lastTime.format('YYYY-MM-DD HH:mm:ss');
        console.log(lastTimeStr)
    } catch (error) {
        console.error('执行过程中出错:', error);
        await stopClashService();
    }
}

main().catch(console.error);
