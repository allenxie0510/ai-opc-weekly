import { SON_ORIGINAL_CHECKS } from '../lib/criteria';
import { Button, Pill } from './ui';

const STEPS = [
  { n: '①', t: '先定长远愿景', d: '19 岁写下「人生 50 年计划」，先确定自己一生想抵达的终点，再倒推该做什么。这是「目标倒推（トップダウン）」的起点。' },
  { n: '②', t: '海量枚举候选', d: '阅读数千本书、拜访大量行业人士，把可能从事的事业列成一份长清单——常见说法是 25 个（也有资料称 40 个）候选方向。' },
  { n: '③', t: '建立筛选标准', d: '把「什么才是我该做的事业」拆成一张可打分的检查项目表（约 40 项），覆盖热爱、独创、夺冠、市场、利润、资本、趋势等维度。' },
  { n: '④', t: '逐项打分筛选', d: '对每个候选事业逐项打分、加权比较，筛出得分最高、且最符合自己长期意志的方向——最终他选中「微机软件流通」，即 SoftBank 的起点。' },
  { n: '⑤', t: '选定后逆向规划', d: '方向一旦确定，就由终局倒推里程碑：若干年内成为第一、需要什么资源、每一步做什么，把宏大愿景拆成可执行的当下动作。' },
];

const AI_MAP: { his: string; ai: string; human: string }[] = [
  { his: '手抄 25–40 个候选事业', ai: 'LLM 批量生成数百上千个结构化机会，覆盖数十个大类', human: '定主题、定范围，圈定「往哪个方向探索」' },
  { his: '40 项检查项目逐一打分', ai: '归纳为 10 个可打分维度，AI 逐机会打 1–10 分 + 程序化加权排名', human: '调整每项权重，覆盖任何 AI 判分' },
  { his: '靠直觉与野心做最终选择', ai: '给出排名、深度研判、风险提示', human: '收藏 / 否决 / 圈定短名单，最终拍板' },
  { his: '心里倒推人生里程碑', ai: '从终局目标自动倒推生成里程碑路线图与「本周第一步」', human: '校准节奏与资源，决定何时、做什么' },
];

export function Methodology({ onStart }: { onStart: () => void }) {
  return (
    <div className="xpl-panel">
      <div className="xpl-methodology">
        <div>
          <div className="xpl-kicker">方法论</div>
          <h2 className="xpl-h2">复现孙正义年轻时代的「机会发现法」</h2>
          <p className="xpl-desc">
            SoftBank 创始人孙正义 19 岁时，用一套近乎「苦行」的方法为自己选定了一生的事业。这个模块把它工程化，并用 AI 放大每一步——但把方向盘留给人。
          </p>
        </div>

        <div className="xpl-method-hero">
          <div className="xpl-quote">
            “我没有发明任何技术，我只是比别人更早、更坚定地相信数字信息革命，并用一生去押注它。”
            <span className="xpl-quote-by">—— 孙正义的「トップダウン（自上而下）」式思考</span>
          </div>
        </div>

        <div>
          <h3 className="xpl-method-h">他的五步法</h3>
          <div className="xpl-method-steps">
            {STEPS.map((s) => (
              <div key={s.n} className="xpl-mstep">
                <div className="xpl-mstep-n">{s.n}</div>
                <div>
                  <strong>{s.t}</strong>
                  <p>{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="xpl-method-h">他的原始检查项目（整理自多份公开资料）</h3>
          <div className="xpl-mchecks">
            {SON_ORIGINAL_CHECKS.map((c, i) => (
              <div key={i} className="xpl-mcheck">
                <span className="xpl-mcheck-no">{i + 1}</span> {c}
              </div>
            ))}
          </div>
          <p className="xpl-small" style={{ marginTop: 10 }}>
            注：原文口径在不同资料中有「25 项」「40 项」等版本，此处为共性条目整理；本模块将其归纳为 10 个可打分维度。
          </p>
        </div>

        <div>
          <h3 className="xpl-method-h">迁移到 AI 时代：三步自动化 + 三个决策门</h3>
          <p className="xpl-desc">
            本模块把孙正义的方法拆成「<strong>海量生成 → 系统筛选 → 逆向规划</strong>」三段自动化流水线，
            并在每段之间设置<strong>人的决策门</strong>，让人随时修正方向。
          </p>
          <div className="xpl-maptable">
            <div className="xpl-map-row xpl-map-head">
              <span>孙正义的做法</span>
              <span>AI 自动化复现</span>
              <span>人的参与（不可替代）</span>
            </div>
            {AI_MAP.map((r, i) => (
              <div key={i} className="xpl-map-row">
                <span>{r.his}</span>
                <span>{r.ai}</span>
                <span>{r.human}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="xpl-human-note">
          <Pill tone="accent">为什么人不能缺席</Pill>
          <p>
            孙正义方法里最难的从来不是计算，而是「我愿不愿意为它付出 50 年」这样的<strong>价值判断</strong>。
            AI 能算市场规模、能列风险，但「热爱」「野心」「意义感」只能由人来回答。
            因此这个模块刻意在<strong>定主题、调权重、拍板方向、校准节奏</strong>四处保留了人的决策门——
            让 AI 做放大器，而不是决策者。
          </p>
        </div>

        <div>
          <h3 className="xpl-method-h">参考资料</h3>
          <ul className="xpl-refs">
            <li><a href="https://baijiahao.baidu.com/s?id=1659196039897518110" target="_blank" rel="noreferrer">一年半调查后，孙正义几个月把一穷二白的公司变成日本最大软件商</a></li>
            <li><a href="https://book.douban.com/review/6677234/" target="_blank" rel="noreferrer">豆瓣书评：孙正义的事业选择与 50 年计划</a></li>
            <li><a href="https://www.163.com/money/article/A6BBKVE0002552IH.html" target="_blank" rel="noreferrer">孙正义 19 岁定下的人生目标</a></li>
            <li><a href="http://www.360doc.com/content/17/0210/08/15691354_627956326.shtml" target="_blank" rel="noreferrer">孙正义选择事业的标准</a></li>
            <li><a href="https://www.gerenjianli.cn/zuowen/daquan/10297055.html" target="_blank" rel="noreferrer">孙正义列出事业检查项目表、节选出 40 项想从事的事业</a></li>
          </ul>
        </div>

        <div className="xpl-foot-row">
          <Button onClick={onStart}>开始探索 →</Button>
        </div>
      </div>
    </div>
  );
}
