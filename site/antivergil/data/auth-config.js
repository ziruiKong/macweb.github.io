/*
 * Google 登录配置
 * ------------------------------------------------------------
 * 想启用真正的 “Sign in with Google”：
 *   1. 在 Google Cloud Console 创建 OAuth 2.0 Web Client ID。
 *   2. 在 “Authorized JavaScript origins” 里加入 https://ziruikong.xyz
 *      （本地调试可加入 http://localhost:8000）。
 *   3. 把 Client ID 填到下面的 googleClientId。
 *   4. 用 `node serve.mjs` 通过 http://localhost:8000 打开（Google 不接受 file://）。
 *
 * 留空时，界面上会提供「本地预览登录」：只接受 @columbia.edu 地址，
 * 数据存在浏览器 localStorage，不上传，方便离线使用。
 * 真正的 Google 登录仍需填写下方 Client ID。
 */
window.COLUMBIA_AUTH = {
  googleClientId: "179310231207-f2r0305ppefi7pr3fi1rf3s5crotgl4b.apps.googleusercontent.com",
  googleCalendarScope: "https://www.googleapis.com/auth/calendar.events",
};
