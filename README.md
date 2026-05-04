# qui

一个快速、现代化的 qBittorrent Web 界面。通过轻量级的单一应用，即可集中管理多个 qBittorrent 实例。

![img](https://github.com/smzase/qui-zh_cn/blob/develop/.github/assets/qui-new.png)

# Fork 说明

### **自用，仅构建 Windows 版本，为 qui 添加基本的简体中文，以及添加一些功能**

- 添加了常用的中文翻译（太多了不想改，这个项目创建之初估计就不考虑支持多语言功能吧）
- 为隐藏“筛选”后添加鼠标悬停显示筛选，并添加“隐藏列筛选”
- 为 qbittorrent 页面的底栏添加了下载和上传总量，并将分开的 ipv4 & ipv6 合并（二合一会更好看吧）
  - 还添加了列表大小缩放

## 文档

完整文档请访问 **[getqui.com](https://getqui.com)**

## 快速开始

### Linux x86_64

```bash
# 下载并解压最新版本
wget $(curl -s https://api.github.com/repos/autobrr/qui/releases/latest | grep browser_download_url | grep linux_x86_64 | cut -d\" -f4)
tar -C /usr/local/bin -xzf qui*.tar.gz

# 运行
./qui serve
```

Web 界面将可通过 http://localhost:7476 访问

### Docker

```bash
docker run -d \
  -p 7476:7476 \
  -v $(pwd)/config:/config \
  ghcr.io/autobrr/qui:latest
```

## 功能特性

- **单二进制文件**：无需依赖，下载即可运行
- **多实例支持**：在一个地方统一管理所有 qBittorrent 实例
- **快速响应**：针对大规模种子集合优化性能
- **交叉做种**：自动跨站点查找并添加匹配的种子
- **自动化规则**：基于条件的规则化种子管理
- **备份与恢复**：支持定时快照及多种恢复模式
- **反向代理**：为外部应用提供透明的 qBittorrent 代理

## 社区

欢迎加入我们的 [Discord](https://discord.autobrr.com/qui) 社区！

## 支持

- [GitHub Discussions](https://github.com/autobrr/qui/discussions/new/choose) - 功能请求与错误报告
- [GitHub Issues](https://github.com/autobrr/qui/issues) - 开发进度跟踪

## 支持开发

qui 由志愿者开发和维护。您的支持将帮助我们持续改进项目。

### 高级主题

可直接在 qui 实例的「设置 → 主题」中购买高级主题，结账后即可立即获得许可证密钥。
如使用加密货币捐赠，请在 [crypto.getqui.com](https://crypto.getqui.com/) 验证交易，以获取高级主题的 100% 折扣码。

### 捐赠

如果您希望通过其他方式支持开发，我们衷心感谢您的捐赠。

- **soup**
  - [Patreon](https://www.patreon.com/c/s0up4200)
  - [GitHub Sponsors](https://github.com/sponsors/s0up4200)
  - [Buy Me a Coffee](https://buymeacoffee.com/s0up4200)
  - [Ko-fi](https://ko-fi.com/s0up4200)
- **zze0s**
  - [GitHub Sponsors](https://github.com/sponsors/zze0s)
  - [Buy Me a Coffee](https://buymeacoffee.com/ze0s)

#### 加密货币

在 [crypto.getqui.com](https://crypto.getqui.com/) 验证您的加密货币捐赠，即可领取高级主题的 100% 折扣码。

#### 比特币 (BTC)
- soup: `bc1qfe093kmhvsa436v4ksz0udfcggg3vtnm2tjgem`
- zze0s: `bc1q2nvdd83hrzelqn4vyjm8tvjwmsuuxsdlg4ws7x`

#### 以太坊 (ETH)
- soup: `0xD8f517c395a68FEa8d19832398d4dA7b45cbc38F`
- zze0s: `0xBF7d749574aabF17fC35b27232892d3F0ff4D423`

#### 莱特币 (LTC)
- soup: `ltc1q86nx64mu2j22psj378amm58ghvy4c9dw80z88h`
- zze0s: `ltc1qza9ffjr5y43uk8nj9ndjx9hkj0ph3rhur6wudn`

#### 门罗币 (XMR)
- 门罗币折扣码需人工处理。请通过 [Discord](https://discord.autobrr.com/qui) 联系或发送邮件至 `s0up4200@pm.me`。
- soup: `8AMPTPgjmLG9armLBvRA8NMZqPWuNT4US3kQoZrxDDVSU21kpYpFr1UCWmmtcBKGsvDCFA3KTphGXExWb3aHEu67JkcjAvC`
- zze0s: `44AvbWXzFN3bnv2oj92AmEaR26PQf5Ys4W155zw3frvEJf2s4g325bk4tRBgH7umSVMhk88vkU3gw9cDvuCSHgpRPsuWVJp`

---

如需其他币种或捐赠方式，请 [通过 Discord 联系我们](https://discord.autobrr.com/qui)。

## 贡献

欢迎贡献代码。注意：本仓库仅限**协作者**创建 Pull Request。请先通过 Discussion/Issue（或 Discord）与我们协调变更事宜。

## 许可证

GPL-2.0-or-later
