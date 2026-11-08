// echarts 按需注册：全量包 ~1.7MB，本项目只用到 map + scatter 两种图。
// 通过此模块统一导入，供 tree-shaking 裁掉未用的 charts/components。
// 新用到其他图（bar/line…）时在这里补注册即可。
import * as echarts from "echarts/core";
import { MapChart, ScatterChart } from "echarts/charts";
import {
  TooltipComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  GeoComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
} from "echarts/components";
// 两种渲染器都注册：
// - canvas：口味图谱等静态散点图（绘制一次不再变化，canvas 更省 DOM）
// - svg：中国地图。地图 roam 时 canvas 需要把 2.5 万个顶点逐帧重新
//   rebuildPath + fill/stroke（实测 p50 21ms/帧、拖动明显掉帧）；
//   SVG 只要给外层 <g> 写一次 transform，几何本身不重绘。
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";

echarts.use([
  MapChart,
  ScatterChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  GeoComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
  CanvasRenderer,
  SVGRenderer,
]);

export default echarts;
