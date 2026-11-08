# USGS 实测光谱来源与复现

原始数据：Kokaly, R. F. 等 (2017), *USGS Spectral Library Version 7 Data*, DOI [10.5066/F7RR1WDJ](https://doi.org/10.5066/F7RR1WDJ)；技术报告 DOI [10.3133/ds1035](https://doi.org/10.3133/ds1035)。[USGS 数据发布页](https://www.usgs.gov/data/usgs-spectral-library-version-7-data)将该数据集标记为 **CC0 1.0**。这里保留数据和文字样本说明，不包含第三方照片。

原始 ASCII 来源为该数据集的 `ASCIIdata_splib07a.zip`（不是重采样的 `splib07b`）；本工作环境使用其公开 GitHub 镜像 `Skylar-TyZhang/EX-spec` 固定提交 `06598564cd6cb19cfd3663cb732f759c821bd83c` 提取对应文件。文件名和记录号均保存在原文件首行，原样存放在此目录。下面是可直接核对的 GitHub 链接（文件本身是 USGS 数据，而不是由镜像作者重新测量）：

- 波长：[ASD 350–2500 nm，2151 通道](https://github.com/Skylar-TyZhang/EX-spec/blob/06598564cd6cb19cfd3663cb732f759c821bd83c/ASCIIdata/ASCIIdata_splib07a/splib07a_Wavelengths_ASD_0.35-2.5_microns_2151_ch.txt)，SHA-256 `57f67300f64ae49fcb8bf5a967cf097e978317047e13e8baf476e2f62af9a23c`。
- [GDS333 浅灰油漆铝板](https://github.com/Skylar-TyZhang/EX-spec/blob/06598564cd6cb19cfd3663cb732f759c821bd83c/ASCIIdata/ASCIIdata_splib07a/ChapterA_ArtificialMaterials/splib07a_Painted_Aluminum_GDS333_LgGr_ASDFRa_AREF.txt)，记录 19509，SHA-256 `0af50ab8ad3dbd00560808e05905aaad382e465905354d264c51a46afbf0f5d4`。这是**涂漆材料**，不是裸铝或镜面。
- [GDS365 新鲜松木胶合板](https://github.com/Skylar-TyZhang/EX-spec/blob/06598564cd6cb19cfd3663cb732f759c821bd83c/ASCIIdata/ASCIIdata_splib07a/ChapterA_ArtificialMaterials/splib07a_Plywood_GDS365_Fresh_Pine_ASDFRa_AREF.txt)，SHA-256 `179430d3ddb15e024b6b8349ca30e672609e6e92943149acd9fc988eb2eb5246`。
- [GDS431 红色防撕裂尼龙布](https://github.com/Skylar-TyZhang/EX-spec/blob/06598564cd6cb19cfd3663cb732f759c821bd83c/ASCIIdata/ASCIIdata_splib07a/ChapterA_ArtificialMaterials/splib07a_Nylon_Fabric_GDS431_Red_RpSt_ASDFRa_AREF.txt)，SHA-256 `07b6c93d70476c3ff41cdb2507caad8d17bb0b74a4211fd7ee2217fa3a738a93`。

本目录的 `.gitattributes` 禁止 Git 自动转换原始数据和样本描述的换行，以便在 Windows 等使用 `core.autocrlf` 的检出中仍保留原始字节和 SHA-256。样本描述 HTML 使用原始的 CR 换行，空白检查允许行尾的 CR。

这些曲线为 USGS 的 **ASDFRa AREF 绝对反射率测量**，不是完整双向反射分布函数 BRDF、玻璃透射谱或本页面纹理照片的现场测量。实验中曲线只映射到主体，纹理仅提供明暗；角度、表面变化及照明皆为近似。光谱可在两个实测采样点之间线性插值；低于 350 或高于 2500 nm 使用最近端点**常值外推**，而不是实测。高速频移若使可见光对应的材料静止系波长越界，结果依赖这项未知带外假设。

在 `chaos-atlas/` 执行 `python3 scripts/extract-usgs-spectra.py`，脚本先核验四个 SHA-256 和每列 2151 个有效值，再将微米转为纳米并生成 `relativity-measured-data.js`；不平滑、归一化或降采样。用 `python3 scripts/extract-usgs-spectra.py --check` 可只验证已有产物而不改写。保留的原始数据和样本说明可以离线核对。
