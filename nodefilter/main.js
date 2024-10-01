const axios = require('axios');
const fs = require('fs');
const yaml = require('yaml');
const notify = {};

// gist 基础参数
const GITHUB_TOKEN = process.env.GIST_PAT;
const GIST_ID = process.env.GIST_LINK.replace("j2wyatt/", "")
const FILE_NAME = 'clash.yaml';
const YOUR_GITHUB_USERNAME = "j2wyatt"
const YAML_URL = 'https://gist.githubusercontent.com/j2wyatt/' + GIST_ID + '/raw/clash.yaml';
const LESS_YAML_URL = 'https://gist.githubusercontent.com/j2wyatt/' + GIST_ID + '/raw/clashless.yaml';
const LESS_FILE_NAME = 'clashless.yaml';
const ALL_FILE_NAME = 'clashall.yaml';

/**
 * 在节点采集完成后，使用这个脚本过滤多余的节点
 *   - gist 文件内容太多，使用官方 api 得到的内容是删减的，搞得我折腾半天
 * */
async function main() {
    // let raw = await loadClashConfig()
    // let raw = await loadGistFile()
    await maxConfig()
    await lessConfig()
};

async function maxConfig() {
    let raw = await readYamlFile(YAML_URL)
    let res = raw;
    // 增加通用规则
    res = await changeRules(res, {axios, yaml, notify});
    // 删掉所有的 vless 节点
    // res = await removeVlessNode(res, {axios, yaml, notify});
    // 每个网站最多五十个节点
    res = await groupNumNodes(res, {axios, yaml, notify});
    // 手动选择的分组里每个网站最多五个
    res = await removeExtraNodes(res, {axios, yaml, notify}, 5);
    // 按照网站建立分组
    res = await madeGroupBySite(res, {axios, yaml, notify});
    // await writeClashConfig(res)
    await updateGistFile(res, FILE_NAME)
}

async function lessConfig() {
    let raw = await readYamlFile(YAML_URL)
    let res = raw;
    // 增加通用规则
    res = await changeRules(res, {axios, yaml, notify});
    // 每个网站最多五十个节点
    res = await groupNumNodes(res, {axios, yaml, notify});
    // 手动选择的分组里每个网站最多五个
    res = await removeExtraNodes(res, {axios, yaml, notify}, 60);
    // await writeClashConfig(res)
    await updateGistFile(res, LESS_FILE_NAME)
}

async function allConfig() {
    let raw = await readYamlFile(YAML_URL)
    let res = raw;
    // 增加通用规则
    res = await changeRules(res, {axios, yaml, notify});
    await updateGistFile(res, ALL_FILE_NAME)
}

async function readYamlFile(url) {
    try {
        const response = await axios.get(url);
        if (response.status !== 200) {
            throw new Error(`Failed to fetch YAML file: ${response.status} ${response.statusText}`);
        }

        const yamlContent = response.data;
        // 解析 YAML 文件内容
        // const parsedYaml = yaml.load(yamlContent);
        // console.log('Parsed YAML:', parsedYaml);
        return yamlContent;
    } catch (error) {
        console.error('Error:', error.message || error);
        throw error;
    }
}


async function loadClashConfig() {
    const yamlFile = fs.readFileSync('/Users/factoryj/Downloads/clash2.yaml', 'utf8');
    // const data = yaml.parse(yamlFile);
    return yamlFile
}

async function writeClashConfig(data) {
    fs.writeFileSync('/Users/factoryj/Downloads/clash-out.yaml', data);
}

// 读取 gist
async function loadGistFile() {
    try {
        // Fetch the current Gist
        const gistResponse = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        // const gist = gistResponse.data;
        const fileContent = gistResponse.data.files[FILE_NAME].content;
        return fileContent
    } catch (error) {
        console.error('Error:', error.message || error);
    }
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

// 每个网站保留最多五十个节点
async function groupNumNodes(raw, {axios, yaml, notify}) {
    let obj = yaml.parse(raw);

    // 函数：减少每个网站的节点数量至最多50个
    const reduceNodesPerSite = (proxies) => {
        let siteCounts = {};
        let reducedProxies = [];

        proxies.forEach(proxy => {
            // 提取代理名称中的网站名称
            let matches = proxy.name.match(/@([^@-]+)/);
            if (matches && matches[1]) {
                let website = matches[1];
                // 统计每个网站的节点数量
                siteCounts[website] = (siteCounts[website] || 0) + 1;

                // 只将节点添加到 reducedProxies 中，如果该网站的节点数量不超过50个
                if (siteCounts[website] <= 50) {
                    reducedProxies.push(proxy);
                }
            } else {
                // 如果节点名称中没有网站信息，直接保留该节点
                reducedProxies.push(proxy);
            }
        });

        return reducedProxies;
    };

    // 减少代理节点数量
    if (obj.proxies) {
        obj.proxies = reduceNodesPerSite(obj.proxies);
    }

    // 函数：从代理组中移除超出限制的节点名称
    const removeExcessNodeNames = async (proxyGroups, proxies) => {
        // 获取所有分组的名称
        let groupNames = proxyGroups.map(group => group.name);
        groupNames.push("REJECT");
        groupNames.push("DIRECT");
        // await urlConsole(groupNames, axios)

        proxyGroups.forEach(async group => {
            // for(let s = 0; s<proxyGroups.length; s++){
            // await urlConsole(group.name, axios)
            // let group = proxyGroups[s]
            if (group.proxies) {
                // await urlConsole("a: " + group.name + group.proxies.length, axios)
                group.proxies = group.proxies.filter(proxyName => {
                    // 在 proxies 中查找是否存在这个节点
                    return proxies.some(proxy => {
                        // 检查节点名是否与任何分组名匹配
                        if (groupNames.includes(proxyName)) {
                            return true;
                        }
                        return proxy.name == proxyName;
                    });
                });
                // await urlConsole("b: " + group.name + group.proxies.length, axios)

            }
            // }
        });
        // await urlConsole(obj['proxy-groups'][0].name + "--" + obj['proxy-groups'][0].proxies.length, axios)
        return yaml.stringify(obj);
        // });
    };

    let pp = ""
    // 从代理组中移除超出限制的节点名称
    if (obj['proxy-groups']) {
        pp = await removeExcessNodeNames(obj['proxy-groups'], obj.proxies);
    }

    // 将对象转换回 YAML 字符串
    // return yaml.stringify(obj);
    return pp
};


// 给每个网站建立一个分组
async function madeGroupBySite(raw, {axios, yaml, notify}) {
    // await urlConsole(raw)
    let config = yaml.parse(raw); // 解析配置文件

    // 创建一个对象用于存储每个网站的节点列表
    let websiteNodes = {};
    // await urlConsole(config)

    // 遍历 proxies，根据节点名中的网站信息分类节点
    config.proxies.forEach(proxy => {
        let matches = proxy.name.match(/@([^@-]+)/);
        if (matches && matches[1]) {
            let website = matches[1];
            if (!websiteNodes[website]) {
                websiteNodes[website] = [];
            }
            websiteNodes[website].push(proxy.name);
        }
    });

    // 创建分组并将节点添加到分组中
    for (let website in websiteNodes) {
        let groupName = `🌐 ${website} 节点-共${websiteNodes[website].length}个`; // 假设分组名为网站名节点
        let group = {
            name: groupName,
            type: 'select',
            proxies: ['♻️ 自动选择', '🎯 全球直连', ...websiteNodes[website]]
        };
        config['proxy-groups'].push(group);
        // 找到 "自动选择" 分组在 proxy-groups 中的位置
        // let autoSelectIndex = config['proxy-groups'].findIndex(gp => gp.name === '♻️ 自动选择');

        // 插入新分组到 "自动选择" 分组后面
        // config['proxy-groups'].splice(autoSelectIndex + 1, 0, group);
    }

    // 将更新后的配置对象转换为 YAML 格式并返回
    return yaml.stringify(config);
}

// 每个网站保留十个节点
async function removeExtraNodes(raw, {axios, yaml, notify}, max) {
    let obj = yaml.parse(raw);
    if (!obj['proxy-groups']) return raw;

    // 查找名称为 "🔰 节点选择" 的分组并处理其中的节点
    let nmp = []
    const nodesMap = new Map();
    const groupIndex = obj['proxy-groups'].findIndex(group => group.name === "🔰 节点选择");
    // await urlConsole(obj['proxy-groups'][groupIndex].proxies, axios)
    if (groupIndex !== -1 && Array.isArray(obj['proxy-groups'][groupIndex].proxies)) {
        // 过滤并保留该分组中每个网站的前十个节点
        obj['proxy-groups'][groupIndex].proxies = obj['proxy-groups'][groupIndex].proxies.filter(async node => {
            const regex = /@([^@-]*)/;
            const match = node.match(regex);
            // let delay = await getDelay(node, axios)
            // await urlConsole(JSON.stringify(delay), axios)
            if (match) {
                const websiteUrl = match[1];
                const count = nodesMap.get(websiteUrl) || 0;
                // hx666 除外
                if (websiteUrl == "hx666.info") {
                    nmp.push(node);
                    return true
                }
                if (count < max) {
                    nodesMap.set(websiteUrl, count + 1);
                    // await urlConsole(nodesMap.get(websiteUrl), axios)
                    // await urlConsole(node)
                    // await urlConsole()
                    nmp.push(node)
                    return true
                }
                return false
            }
            nmp.push(node)
            return true; // 保留不符合模式的节点
        });
    }
    obj['proxy-groups'][groupIndex].proxies = nmp
    // await urlConsole(obj['proxy-groups'][groupIndex].proxies.length + "--" + nodesMap.size + "--" + nmp.length, axios)

    return yaml.stringify(obj);
}

function deleteLocalContronyGroup() {
    // // 解析配置文件
    // const obj = yaml.parse(raw);
    // // 删除 "国内媒体" 分组
    // if (obj['proxy-groups']) {
    //     obj['proxy-groups'] = obj['proxy-groups'].filter(group => group.name !== '🌏 国内媒体');
    // }
    // // 删除对应的规则
    // if (obj['rules']) {
    //     obj['rules'] = obj['rules'].filter(rule => !rule.includes('🌏 国内媒体'));
    // }
    // // 将修改后的配置文件转换回 YAML 字符串
    // return yaml.stringify(obj);
}


// 给节点名字加上域名
function addSecName(raw, {axios, yaml, notify}) {
    let obj = yaml.parse(raw);

    // 提取关键词的函数
    function extractKeyword(server) {
        const match = server.match(/[^.]+\.[^.]+$/);
        if (match) {
            const parts = match[0].split('.');
            if (parts.length >= 2) {
                return parts[0];
            }
        }
        return null;
    }

    // 更新节点名称的函数
    function updateNodeName(node, keyword) {
        if (keyword) {
            node.name += `@${keyword}`;
        }
        return node.name;
    }

    // 存储旧名称到新名称的映射
    const nodeNameMap = {};

    // 更新节点名称
    obj.proxies.forEach(node => {
        let keyword;
        if (node.type === 'vmess' && node['ws-opts'] && node['ws-opts'].headers && node['ws-opts'].headers.Host) {
            keyword = extractKeyword(node['ws-opts'].headers.Host);
        } else {
            keyword = extractKeyword(node.server);
        }

        if (keyword) {
            const oldName = node.name;
            const newName = updateNodeName(node, keyword);
            nodeNameMap[oldName] = newName;
        }
    });

    // 更新分组中的节点名称
    obj['proxy-groups'].forEach(group => {
        group.proxies = group.proxies.map(proxy => nodeNameMap[proxy] || proxy);
    });

    return yaml.stringify(obj);
}

function removeVlessNode(raw, {axios, yaml, notify}) {
    let obj = yaml.parse(raw);

    // 函数：移除所有 type 为 vless 的节点
    const removeVlessNodes = (proxies) => {
        // let iftype = (proxy.type === 'vless') || (proxy.type === 'hysteria2')
        // 找出所有 type 为 vless 的节点名字
        const vlessNodeNames = proxies.filter(proxy => (proxy.type === 'vless')
                                              || (proxy.type === 'hysteria2')
                                              || (proxy.type === 'cipher')).map(proxy => proxy.name);

        // 过滤掉 type 为 vless 的节点
        let filteredProxies = proxies.filter(proxy => (proxy.type !== 'vless')
                                             && (proxy.type !== 'hysteria2') && (proxy.type !== 'cipher'));

        return {filteredProxies, vlessNodeNames};
    };

    // 函数：从代理组中移除 vless 类型节点的名字
    const removeVlessNodeNamesFromGroups = (proxyGroups, vlessNodeNames) => {
        proxyGroups.forEach(group => {
            if (group.proxies) {
                // 过滤掉代理组中包含 vless 节点的代理名字
                group.proxies = group.proxies.filter(proxyName => !vlessNodeNames.includes(proxyName));
            }
        });
    };

    // 移除 vless 节点，并获取 vless 节点的名字列表
    if (obj.proxies) {
        const {filteredProxies, vlessNodeNames} = removeVlessNodes(obj.proxies);
        obj.proxies = filteredProxies;

        // 从代理组中移除 vless 节点的名字
        if (obj['proxy-groups']) {
            removeVlessNodeNamesFromGroups(obj['proxy-groups'], vlessNodeNames);
        }
    }

    // 将对象转换回 YAML 字符串
    return yaml.stringify(obj);
}

// 添加第三方规则
function changeRules(raw, {axios, yaml, notify}) {
    const newRules = `
rules:
  - RULE-SET,applications,DIRECT
  - DOMAIN,clash.razord.top,DIRECT
  - DOMAIN,yacd.haishan.me,DIRECT
  - RULE-SET,private,DIRECT
  - RULE-SET,reject,REJECT
  - RULE-SET,icloud,DIRECT
  - RULE-SET,apple,DIRECT
  - RULE-SET,google,🌍 国外媒体
  - RULE-SET,proxy,🌍 国外媒体
  - RULE-SET,direct,DIRECT
  - RULE-SET,lancidr,DIRECT
  - RULE-SET,cncidr,DIRECT
  - RULE-SET,telegramcidr,🌍 国外媒体
  - GEOIP,LAN,DIRECT
  - GEOIP,CN,DIRECT
  - MATCH,🌍 国外媒体
`;

    const newRuleProviders = `
rule-providers:
  reject:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/reject.txt"
    path: ./ruleset/reject.yaml
    interval: 86400

  icloud:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/icloud.txt"
    path: ./ruleset/icloud.yaml
    interval: 86400

  apple:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/apple.txt"
    path: ./ruleset/apple.yaml
    interval: 86400

  google:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/google.txt"
    path: ./ruleset/google.yaml
    interval: 86400

  proxy:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/proxy.txt"
    path: ./ruleset/proxy.yaml
    interval: 86400

  direct:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/direct.txt"
    path: ./ruleset/direct.yaml
    interval: 86400

  private:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/private.txt"
    path: ./ruleset/private.yaml
    interval: 86400

  gfw:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/gfw.txt"
    path: ./ruleset/gfw.yaml
    interval: 86400

  tld-not-cn:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/tld-not-cn.txt"
    path: ./ruleset/tld-not-cn.yaml
    interval: 86400

  telegramcidr:
    type: http
    behavior: ipcidr
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/telegramcidr.txt"
    path: ./ruleset/telegramcidr.yaml
    interval: 86400

  cncidr:
    type: http
    behavior: ipcidr
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/cncidr.txt"
    path: ./ruleset/cncidr.yaml
    interval: 86400

  lancidr:
    type: http
    behavior: ipcidr
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/lancidr.txt"
    path: ./ruleset/lancidr.yaml
    interval: 86400

  applications:
    type: http
    behavior: classical
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/applications.txt"
    path: ./ruleset/applications.yaml
    interval: 86400
        `;

    const obj = yaml.parse(raw);
    obj.rules = yaml.parse(newRules).rules;
    obj['rule-providers'] = yaml.parse(newRuleProviders)['rule-providers'];

    return yaml.stringify(obj);
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

// 节点测速
// 肯定不能用啊，因为此时配置文件没有加载，必定是找不到这个节点啊
async function getDelay(str, axios) {
    let secret = '874b1b67-5ea1-46e0-ad6c-8e00c25d77bb'
    try {
        const response = await axios.get('http://127.0.0.1:53045/proxies/' + str + '/delay',
            {
                params: {
                    timeout: 3000, url: 'http://www.google-analytics.com/generate_204'
                },
                headers: {
                    'Authorization': `Bearer ${secret}`,
                }
            })
        console.log('POST 请求成功：', response.data);
        await urlConsole(JSON.stringify(response), axios)
        return response
    } catch (error) {
        await urlConsole(JSON.stringify(error), axios)
        console.error('POST 请求失败：', error);
    }
}

// ============= 服务器代码，复制到其他位置执行 ================
// const http = require('http');
// const server = http.createServer((req, res) => {
//   if (req.method === 'POST' && req.url === '/') {
//     let body = [];

//     req.on('data', (chunk) => {
//       body.push(chunk);
//     });

//     req.on('end', () => {
//       body = Buffer.concat(body).toString();
//       console.log('Received data:');
//       console.log(body);

//       res.writeHead(200, { 'Content-Type': 'text/plain' });
//       res.end('Data received\n');
//     });
//   } else {
//     res.writeHead(404, { 'Content-Type': 'text/plain' });
//     res.end('Not found\n');
//   }
// });

// const PORT = 3000;
// const HOSTNAME = '127.0.0.1';

// server.listen(PORT, HOSTNAME, () => {
//   console.log(`Server running at http://${HOSTNAME}:${PORT}/`);
// });


main()
