/*
 * Google Maps 3D 配置
 * ------------------------------------------------------------
 * 不填写 API Key 时，地图使用 Google Maps 的真实卫星底图嵌入。
 *
 * 要在页面内启用可倾斜、旋转的 Google 3D 地图：
 *   1. 在 Google Cloud Console 启用 Maps JavaScript API。
 *   2. 创建 API Key，并限制到网站的 HTTP referrer。
 *   3. 创建一个 Map ID（Map style: JavaScript / Vector）。
 *   4. 将 API Key 和 Map ID 填入下面两项。
 *
 * API Key 会出现在静态前端代码中，请务必设置 HTTP referrer 限制。
 */
window.COLUMBIA_MAPS = {
  googleApiKey: "",
  googleMapId: "",
  center: { lat: 40.8077, lng: -73.9621 },
  zoom: 17,
};
