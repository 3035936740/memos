# 示例风格包

两套可以直接安装的社区风格包，也是写风格包时的参考。格式和规则见 [docs/style-pack-authoring.md](../../docs/style-pack-authoring.md)。

| 风格包 | 亮色配色 | 暗色配色 |
| --- | --- | --- |
| [拟物化 Skeuomorphism](skeuomorphism/) | 亚麻桌面上的纸张 | 红木桌上的缝线皮革 |
| [梦核 Dreamcore](dreamcore/) | 粉彩云天，水天一线 | 紫色银河 |

两套都跟随访客的配色：纹理是灰度的，会混进主题的颜色。所有图片都是 CC0，来源见各自的 README。

## 安装

管理员在“设置 → 风格包”里点“安装风格包”，选 `skeuomorphism.zip` 或 `dreamcore.zip`。装好后默认是关的。可以先点“预览”，在自己的标签页里看效果，其他访客看不到；满意了再打开，所有访客都能在风格选择里看到它。

## 修改后重新打包

改完文件夹里的 `style.css`、`style.json` 或 `assets/` 后运行：

```sh
python3 check_pack.py skeuomorphism dreamcore
```

它按服务器的规则检查，通过后在旁边重新生成 ZIP，只需要 Python 3 标准库。服务器上的权威检查是 `memos stylepack check skeuomorphism.zip`。
