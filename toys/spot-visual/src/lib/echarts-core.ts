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
import { CanvasRenderer } from "echarts/renderers";

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
]);

export default echarts;
