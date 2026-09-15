export default function ProductInfoContent() {
  return <div className="space-y-5 p-6 text-sm leading-7 text-zinc-600">
    <h2 className="text-xl font-semibold text-zinc-900">灵感收纳箱 · Mellow</h2>
    <p>随手记录碎片想法，再进行分类和整理。减少记录前选择位置、格式以及记录后二次归档的成本。</p>
    <h3 className="font-semibold">核心流程</h3>
    <p>创建空白空间 → 新建收纳单元 → 写下灵感 → 确认分类建议或手动归类 → 回顾、编辑与复制。</p>
    <p>“说人话”用于整理表达，“再想下”用于扩展思考。真实 AI 请求需要本地服务端配置模型密钥；未配置时请使用手动收纳。分类失败时可能返回本地相似度候选，不等于模型判断。</p>
    <h3 className="font-semibold">公开展示版边界</h3>
    <p>数据仅保存在当前浏览器；不连接原私人数据库，不提供云同步。空间码只是本地分区标识，不是安全账号认证。清除站点数据会丢失记录，请仅用虚构内容体验。</p>
    <p>本产品用于捕捉和临时整理想法，不替代完整知识库。AI 输出需人工核对。</p>
  </div>;
}
