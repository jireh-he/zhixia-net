# share/ — P2P files 服务白名单目录

`zhixia files` / `zhixia listen` 的默认服务目录（2026-09-18 起，不再默认整仓）。
对端 `zhixia ls` 只能看到本目录，`zhixia get` 只能拉本目录下的文件。

- 想共享给 P2P 朋友的内容，放这里。
- 仓库里的其他文件（源码、文档、data/、bin/）不再通过 P2P 通道暴露。
- 需要整仓共享时用 `zhixia files ..` 或 `zhixia listen --files-dir ..`（启动前有敏感文件预警，自行把关）。
