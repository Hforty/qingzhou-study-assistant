# 轻舟学习助手 1.0.6

供 Windows 使用的本机学习记录与计划工具。双击独立安装包即可安装，安装与使用不依赖这个源码文件夹，也不需要命令行或浏览器。

## 使用

首次打开先选数学、英语及政治模式，生成本周草案，编辑后确认进入首页。默认每天四小时、每周七天，规划初试日为 2027-12-20；这些设置之后都可修改。

学习计划以周一到周日为一周。普通草案在关闭后保留。任务行保留打卡和开始，编辑、顺延、暂停及自加任务删除位于“更多操作”。有草案时，首页正式任务仍可打卡；草案需要重新核对后确认。

修改可学习日并保存，会按目录顺序重建本周剩余内容及默认计划；有效人工调整继续应用。其他设置保存不会替换默认。普通重新生成先预览草案，不替换默认。“查看原版”显示当前默认版本，其中的“恢复默认计划”撤销本周人为修改，不回滚设置和实际完成记录。编辑 A 为 B 后完成，恢复时 B 保留为历史，不会将完成状态套到 A。

专注空间显示今日各课程累计时长和完整历史，可按课程、日期筛选和翻页。计时只记录实际经过时间，暂停不计入；保存失败冻结结束记录，重试保持日期和时长且不重复记录。

1.0.6 覆盖安装保留 1.0.5 的 v4 记录及备份。更早的 v1–v3 原始数据仍可单独导出，不自动迁入。完整备份包含任务来源、默认版本、草案、调整、完成、进度、笔记与专注；导入导出上限均为 30 MiB。

## 源码

- `core.mjs`：记录、验证、事务保存与学习自评。
- `planner.mjs`：统一的纯计算入口 `evaluatePlan`。输入记录和日期/命令，返回候选记录、摘要与提示。
- `curriculum.mjs`：课程目录与选科范围。
- `app.js` / `styles.css`：工作台、受控选择器、输入保护与界面。
- `desktop`：受限桌面接口、窗口及原生菜单。
- `resources/installer.nsh`：可选卸载清理及固定目录安全检查。
- `tests`、`scripts/verify-v106.cjs`：核心回归及隔离桌面验收。

后续开发以本 GitHub 仓库为准。提交与 PR 自动触发 GitHub Actions，在云端运行核心测试、Windows 构建、桌面回归和隔离覆盖升级测试，不再使用用户电脑进行更新与测试。通过后生成安装包 artifact 和 Releases 草稿。操作说明见 [云端开发与发布](docs/CLOUD.md)。

安装标识 `cn.qingzhou.study`，数据目录 `%APPDATA%\QingzhouStudy`。卸载勾选清理时额外删除 `%LOCALAPPDATA%\qingzhou-study-updater`。覆盖升级、静默、`--updated`、`/KEEP_APP_DATA` 路径保留记录。用户另存的备份、安装包和源码不在清理范围。

## 交互参考

[Microsoft Fluent 组合框规范](https://fluent2.microsoft.design/components/web/react/core/combobox/usage)与 [W3C 模态对话框模式](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)：明确标签、可访问的完整选择结果、键盘选择、焦点限制与恢复、可关闭的分层弹窗。

联系我们：轻舟项目开发者 · 2024304827@aust.edu.cn。

## 云端入口

- [自动测试与构建](https://github.com/Hforty/ai-study-assistant/actions/workflows/qingzhou-cloud.yml)
- [版本与安装包](https://github.com/Hforty/ai-study-assistant/releases)
- [问题反馈](https://github.com/Hforty/ai-study-assistant/issues)

本仓库当前内容已经替换为轻舟桌面软件源码；旧网页项目不属于当前产品。历史提交保留供追溯。
