#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/zh/sources/own.json: the Chinese deinflection rules written
// for this pack (docs/languages.md, section 14 step 2). Run from the
// repository root:
//
//   node languages/zh/sources/build-own.mjs [--cedict <CC-CEDICT.zip>] [--freq <zh_tw_50k.txt>]
//
// Chinese has no inflection, but a learner meets words whose dictionary form
// is not a prefix of the text, or is only part of it:
//
// - reduplication: AA, A一A, A了A, A了一A (看看, 看一看, 看了看, 看了一看 →
//   看), AAB of a verb-object compound (散散步 → 散步), AABB (高高兴兴 → 高兴),
//   ABAB (研究研究 → 研究) and A里AB (糊里糊涂 → 糊涂);
// - A-not-A questions: A不A and A不AB (好不好 → 好, 喜不喜欢 → 喜欢), A没A
//   (有没有 → 有);
// - separable verb-object compounds with words between the verb and its
//   object (洗了个澡 → 洗澡, 生他的气 → 生气, 睡不着觉 → 睡觉);
// - potential complements: V不C and V得C (看不见 → 看见, 听得懂 → 听懂), and
//   V不了 (去不了 → 去);
// - the plural suffix 们 (朋友们 → 朋友) and the erhua suffix 儿 (一点儿 → 一点).
//
// The word lists below are written for this pack from the standard
// description of Mandarin grammar (Chao, A Grammar of Spoken Chinese, 1968;
// Li and Thompson, Mandarin Chinese: A Functional Reference Grammar, 1981;
// Liu Yuehua et al., 实用现代汉语语法, 2001). They are in simplified
// characters; every literal is also written in its traditional forms, taken
// from CC-CEDICT's pairs of simplified and traditional headwords and weighted
// by a frequency list of traditional-character subtitles (FrequencyWords
// zh_tw_50k). No word, sense or part of speech is taken from a dictionary.
//
// Rules carry the part of speech of the dictionary form they give (v, adj,
// n, pron), as section 14 asks; see the Rules section below.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatJson, formatTransforms} from '../../../tools/lib/json.mjs';
import {cedictTables, formsAbove} from './variants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = '/local/home/skerraut/herd-synth3/clones/hachi-lang-cache/zh';
const argument = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : fallback;
};
const CEDICT = argument('--cedict', join(CACHE, 'CC-CEDICT.zip'));
const FREQ = argument('--freq', join(CACHE, 'zh_tw_50k.txt'));

// --- Traditional forms ----------------------------------------------------
// A rule literal is also written in each traditional form its characters take
// in CC-CEDICT's headword pairs (sources/variants.mjs): 发 is 發 or 髮, 后 is
// 後 or 后, 干 is 幹, 干 or 乾. A form counts when the traditional words it is
// written in have at least 3% of the weight of the character's main form
// (麵 for 面, not 瞭 for 了); 着 also keeps 着, which Hong Kong text writes for
// 著, 刮 also 颳 (颳風), and 家, 杯 and 碗 keep only themselves (傢, 盃 and 盌
// are written only in a few words).

const {forms: table, words: cedictWords} = cedictTables(CEDICT, FREQ);
const EXTRA = new Map([['着', ['著', '着']], ['刮', ['刮', '颳']], ['家', ['家']], ['杯', ['杯']], ['碗', ['碗']]]);

/** The traditional forms of a simplified character (itself when it has none). */
function tradForms(c) {
    return EXTRA.get(c) ?? formsAbove(table, c, 0.03);
}

/** A character and its traditional forms. */
const forms = (c) => [...new Set([c, ...tradForms(c)])];

/**
 * The traditional spellings of a simplified string: CC-CEDICT's traditional
 * headwords for it (干净 → 乾淨), or else the combinations of its characters'
 * forms (at most 4).
 */
function tradSpellings(text) {
    if ([...text].length > 1 && cedictWords.has(text)) { return [...cedictWords.get(text)]; }
    let out = [''];
    for (const c of text) {
        out = out.flatMap((prefix) => tradForms(c).map((f) => prefix + f));
        if (out.length > 4) { out = out.slice(0, 4); }
    }
    return out;
}

/** A simplified string and its traditional spellings, simplified first. */
const spellings = (text) => [...new Set([text, ...tradSpellings(text)])];

/** Each spelling of a simplified word with the script it is in. */
const scripted = (text) => [['s', text], ...tradSpellings(text).map((t) => ['t', t])];

const chars = (s) => [...new Set([...s.replace(/\s+/gu, '')])];
const words = (s) => [...new Set(s.split(/\s+/u).filter(Boolean))];

// --- Word lists -------------------------------------------------------------

// Monosyllabic verbs of actions that reduplicate as AA, A一A and A了A (看看,
// 看一看, 看了看): volitional, repeatable actions done briefly or tentatively.
const ACTION_VERBS = chars(`
    看 想 试 走 尝 听 说 谈 问 坐 歇 等 找 查 算 读 写 学 玩 聊 逛 跑 跳 唱 洗 擦 扫
    收 拿 放 摸 拍 揉 抱 亲 闻 笑 叫 喊 劝 帮 教 讲 练 改 修 补 理 整 弄 搞 动 摇 点 挥
    招 转 翻 比 量 称 数 猜 考 评 选 送 借 还 买 吃 喝 品 晒 泡 烤 煮 炒 切 剪 梳 刷 抹
    涂 画 填 签 包 装 搬 挪 推 拉 提 抬 举 扶 拖 捏 敲 打 踢 碰 踩 跺 蹲 站 躺 靠 爬 游
    吹 扇 冲 浇 洒 甩 抖 晃 摆 挂 贴 卷 折 叠 铺 盖 瞧 瞅 望 盯 瞪 眨 睁 闭 舔 咬 嚼 吸
    叹 哼 骂 夸 谢 求 请 催 逗 哄 陪 熬 忍 让 管 照 养 喂 遛 溜 闯 赶 追 跟 接 见 拜 乐
    闹 吵 抢 吓 捧 托 顶 撑 压 按 捶 挠 抓 掏 挑 捡 摘 磨 晾 缝 揍 抽 蹭 拌 搅 掂 搓 端
    递 寄 换 分 合 凑 拼 涮 蒸 煎 背 扛 拎 夹 揪 拽 拔 掐 扭 拧 掀 揭 撩 拨 挤 削 刮 钻
    撞 踏 迈 蹦 挖 搜 探 眯 念 做 用 穿 戴 记 活 待 呆 住 嗅`);

// The verbs of the rarer A了一A (看了一看, 想了一想, 笑了一笑).
const LE_YI_VERBS = chars(`
    看 想 试 听 问 闻 笑 点 摇 挥 招 拍 摸 尝 瞧 望 翻 推 拉 动 抖 晃 转 停 顿 叹 哼 皱 眨`);

// Monosyllabic adjectives that reduplicate as AA (慢慢, 好好, 红红).
const ADJECTIVES = chars(`
    慢 好 快 早 远 轻 重 深 满 甜 香 软 静 冷 热 暖 凉 胖 瘦 圆 细 厚 薄 亮 弯
    直 乖 美 高 矮 短 长 大 小 红 白 黑 蓝 绿 黄 紫 尖 平 稳 松 紧 干 湿 旧 新
    多 少 淡 浓 傻 呆 憨 笨 嫩 老 闲 忙 乱 足 狠 活 硬 脆 酥 辣 酸 咸 苦 香 臭
    鲜 肥 壮 娇 俏 帅 醉 晕 空 亮 暗 偷 默 久 牢 死 苦`);

// Monosyllables of the A-not-A question A不A (好不好, 能不能, 去不去):
// common verbs, adjectives and modal verbs.
const NOT_A_MONO = chars(`
    是 有 对 行 要 能 会 可 敢 肯 配 够 像 在 来 去 走 看 听 说 想 吃 喝 买 卖 玩 做 用
    写 读 学 教 问 找 等 试 信 爱 怕 恨 疼 痒 懂 记 认 喜 跑 跳 唱 洗 睡 坐 站 开 关 打
    帮 借 还 送 给 带 拿 换 管 帮 请 回 叫 抽 穿 戴 交 修 搬 停 讲 谈 聊 考 算 选 跟 追
    好 坏 大 小 多 少 长 短 高 矮 胖 瘦 远 近 快 慢 早 晚 冷 热 暖 凉 新 旧 老 贵 累 饿
    渴 困 饱 忙 闲 难 熟 准 真 甜 苦 辣 酸 咸 香 臭 美 丑 帅 酷 乖 乱 静 吵 怪 深 浅 厚
    薄 重 轻 硬 软 干 湿 亮 暗 红 白 黑 蓝 绿 黄 宽 窄 粗 细 圆 稳 松 紧 脏 净 满 空 该`);

// Disyllabic words of the A-not-A question A不AB (喜不喜欢 → 喜欢,
// 可不可以 → 可以, 抽不抽烟 → 抽烟).
const NOT_A_DI = words(`
    喜欢 知道 认识 介意 明白 愿意 需要 同意 满意 相信 舒服 漂亮 清楚 习惯 应该 可以
    可能 容易 高兴 好吃 好看 好玩 好听 好用 重要 讨厌 成功 适合 帮助 快乐 害怕 担心
    记得 觉得 认得 晓得 懂得 舍得 值得 打算 准备 决定 了解 理解 关心 注意 合适 方便
    简单 复杂 麻烦 辛苦 健康 危险 安全 干净 便宜 开心 生气 伤心 放心 紧张 聪明 努力
    认真 厉害 可爱 应当 允许 承认 参加 熟悉 有趣 满足 公平 正常 自然 随便 普通 特别
    主要 情愿 甘心 相同 奇怪 愉快 顺利 成熟 及时 原谅 感动 感谢 赞成 反对 支持 可靠
    精彩 温柔 真实 正确 自由 严重 严格 明显 清楚 新鲜 安静 热闹 干燥 暖和 凉快 舒适
    合理 公开 礼貌 客气 能够 敢于 肯定 确定 一定 必要 足够 好意思 感兴趣 来得及
    出来 进来 回来 起来 下来 上来 过来 出去 进去 回去 上去 下去 过去 在家 回家 结婚
    离婚 毕业 上班 下班 上学 放学 抽烟 吃饭 喝酒 洗澡 睡觉 发烧 下雨 下雪 开车 见面
    帮忙 生病 吃药 要紧 要命 对劲 像话 够用`);

// Monosyllabic verbs of the question A没A (有没有, 去没去, 吃没吃).
const MEI_A_MONO = chars(`
    有 去 来 到 见 完 做 说 看 听 想 吃 喝 买 写 读 学 问 找 试 打 开 关 走 起 进 出 回
    带 拿 送 还 借 换 用 交 发 收 洗 睡 玩 记 考 修 放 寄 接 叫 请 告 搬 停 算 选 跟 穿`);

// Words of the question A没AB (吃没吃饭 → 吃饭, 看没看见 → 看见, 有没有人 →
// 有人, 去没去过 → 去过).
const MEI_A_DI = words(`
    吃饭 喝水 洗澡 睡觉 起床 吃药 看见 听见 遇见 碰见 做完 写完 看完 吃完 听懂 看懂
    想好 准备 带来 回来 回家 下班 上班 放学 毕业 结婚 见面 来过 去过 见过 吃过 看过
    听过 说过 做过 用过 想过 学过 试过 玩过 买过 到过 住过 有人 有空 有钱 有意思 有兴趣
    有可能 有时间 有问题 有关系 有办法 有事 有用 有效 有名 有趣 有病 有意义 有道理
    有机会 有必要 有区别 有影响 有希望 有危险 有经验`);

// Verb-object compounds whose verb reduplicates as AAB (散散步, 聊聊天).
const AAB_COMPOUNDS = words(`
    散步 聊天 跳舞 唱歌 洗澡 洗手 洗脸 刷牙 理发 照相 跑步 游泳 睡觉 压惊 消气
    叹气 帮忙 见面 握手 招手 挥手 拍手 点头 摇头 抬头 低头 转身 弯腰 伸腰 散心
    谈心 透气 吹风 喝茶 下棋 打球 逛街 看书 写字 读书 上网 泡脚 跺脚 动手 动脑
    尝鲜 解闷 解馋 歇脚 遛狗 跑腿 发呆 跳绳 打牌 钓鱼 爬山 骑车 兜风 串门 做饭
    喝酒 擦汗 擦嘴 眨眼 揉眼 晒太阳 打招呼 开玩笑 出主意 发牢骚 冲凉 练字 养花
    做梦 做操 洗碗 扫地 拖地 搓手 碰头 消食`);

// AABB forms (高高兴兴 → 高兴): the AB word is reduplicated syllable by syllable.
const AABB_WORDS = words(`
    高兴 干净 清楚 明白 漂亮 认真 舒服 简单 安静 快乐 平安 整齐 仔细 随便 马虎
    大方 客气 老实 普通 轻松 痛快 热闹 糊涂 开心 辛苦 实在 踏实 规矩 恭敬 稳当
    亲热 甜蜜 干脆 和气 清白 平常 平静 安稳 结实 秀气 利落 利索 爽快 匆忙 慌张
    迷糊 冷清 清静 斯文 顺利 地道 快活 舒坦 自在 欢喜 欢乐 亲切 和睦 齐整 端正
    正经 严实 紧张 忙碌 勤恳 恩爱 健康 平淡 模糊 含糊 啰嗦 唠叨 婆妈 吞吐 支吾
    结巴 嘻哈 熙攘 吵闹 打闹 说笑 进出 来往 上下 前后 里外 时刻 日夜 子孙 世代
    方面 点滴 风雨 山水 男女 老少 大小 多少 高低 坑洼 弯曲 曲折 隐约 朦胧 断续
    零星 零散 浩荡 战兢 兢业 偷摸 躲闪 摇晃 蹦跳 跌撞 拖拉 歪扭 挑拣 缝补 修补
    涂改 写画 指点 拉扯 说道 吹打 敲打 拍打 推搡 打扮 磕碰 哭啼 吵嚷 叽喳 唧喳
    轰烈 堂正 明亮 干爽 光滑 清爽 漂泊 飘摇 浑噩 懵懂 恍惚 磨蹭 慢腾 犹豫`);

// ABAB forms of disyllabic verbs and of state adjectives (研究研究 → 研究,
// 雪白雪白 → 雪白).
const ABAB_WORDS = words(`
    研究 休息 讨论 考虑 商量 介绍 学习 练习 准备 打扫 收拾 整理 活动 锻炼 了解
    检查 帮助 打听 联系 认识 体验 尝试 参观 比较 交流 沟通 表扬 批评 照顾 欣赏
    享受 放松 庆祝 调查 分析 思考 回忆 解释 说明 安排 计划 打扮 熟悉 适应 关心
    安慰 鼓励 提醒 教育 培养 修理 清理 处理 布置 实践 交谈 观察 探讨 请教 指点
    指导 琢磨 合计 盘算 寻思 掂量 斟酌 品尝 体会 感受 溜达 热闹 高兴 痛快 凉快
    暖和 轻松 舒服 乐呵 清醒 冷静 安静 修改 改正 招待 款待 慰问
    雪白 通红 冰凉 笔直 漆黑 火红 碧绿 金黄 粉红 喷香 滚烫 冰冷 雪亮 瓦蓝 蜡黄
    乌黑 湛蓝 绯红 鲜红 嫩绿 翠绿 煞白 惨白 焦黄 精瘦 精光 稀烂 稀碎 粉碎 崭新
    锃亮 溜圆 滚圆 滚热 黢黑 墨黑 透亮 冰冷 闷热 喷香`);

// A里AB forms (糊里糊涂 → 糊涂).
const A_LI_AB_WORDS = words(`糊涂 慌张 啰嗦 罗嗦 马虎 土气 怪气 傻气 小气 流气 妖气 娇气 洋气 古怪 邋遢 哆嗦 啰唆 糊涂`);

// Verb-object compounds that words can separate (洗了个澡, 生他的气, 睡不着
// 觉, 见过几次面): a verb of one character and its object. SEPARABLE holds
// compounds whose meaning is more than the verb and the noun, or whose
// object is not a free noun (洗澡, 生气, 帮忙, 吃亏, 上当): every insertion
// below separates them. COMPOSITIONAL holds compounds of a verb and an
// ordinary noun (吃饭, 看书, 写信, 打电话): only aspect markers,
// complements, numerals with measure words, possessors with 的 and question
// words separate them, because a demonstrative (做那件事) or an adjective
// (上大学) before such a noun makes an ordinary verb phrase.
const SEPARABLE = words(`
    睡觉 洗澡 冲澡 泡澡 帮忙 见面 碰面 会面 结婚 离婚 求婚 订婚 毕业 就业 游泳
    唱歌 跳舞 散步 跑步 让步 聊天 谈天 请客 上课 下课 讲课 逃课 选课 备课 代课
    补课 听课 考试 照相 拍照 理发 打针 发烧 担心 伤心 放心 操心 散心 谈心 费心
    分心 生气 叹气 出气 受气 泄气 赌气 喘气 消气 透气 憋气 蹭饭 要饭 吵架 打架
    劝架 放假 请假 休假 排队 插队 道歉 鞠躬 握手 招手 挥手 拍手 动手 分手
    插手 举手 撒手 放手 起床 丢脸 翻脸 上班 下班 加班 值班 换班 上学 放学 留学
    退学 逃学 看病 生病 治病 住院 出院 报名 签名 点名 录音 滑冰 溜冰 爬山
    登山 上山 下山 花钱 赚钱 挣钱 借钱 还钱 付钱 换钱 存钱 取钱 收钱 交钱
    省钱 出事 办事 闹事 惹事 下雨 下雪 刮风 吹风 上当 开玩笑 打招呼 打交道 出主意
    拿主意 打主意 占便宜 吃醋 吃亏 吃苦 受苦 吃惊 受惊 受罪 犯罪 赔罪 遭罪 点头
    摇头 带头 低头 回头 磕头 抬头 剃头 皱眉 耸肩 眨眼 睁眼 闭眼 瞪眼 张嘴 闭嘴
    插嘴 还嘴 顶嘴 亲嘴 斗嘴 拌嘴 开口 张口 漱口 改口 松口 打球 踢球 下棋 打牌
    看戏 演戏 唱戏 念书 教书 签字 识字 打字 串门 搬家 成家 过年 拜年 过节 喂奶
    断奶 敬酒 讲价 砍价 涨价 降价 投票 检票 退票 上网 挂号 对号 排号 合影 破例 举例
    表态 服刑 判刑 付款 存款 取款 贷款 结账 算账 记账 买单 埋单 下单 出力 用力
    尽力 费力 使劲 费劲 起劲 走神 出神 分神 留神 加油 出汗 流汗 流血 出血 献血
    抽血 流泪 掉泪 受伤 冒险 辞职 任职 就职 打工 上工 开工 收工 罢工 当兵 当官
    做官 做生意 做梦 做主 作主 做操 作弊 做手术 动手术 化妆 整容 失踪 搁浅 洗礼 送礼
    行礼 敬礼 分类 借火 发火 点火 着火 开户 打赌 打折 充电 停电 享福 生根 出国
    回国 吃素 告状 报案 破案 作案 保密 告密 泄密 发财 发言 发誓 发呆 发疯 发愁 发脾气
    发牢骚 发芽 接吻 鼓掌 拍戏 上台 下台 上岗 下岗 退休 入伍 参军 掌权 用心 用功
    吃苦头 拍马屁 吹牛 吹牛皮 走后门 开夜车 泼冷水 碰钉子 打哈欠 打喷嚏 打瞌睡 打官司
    打仗 打车 打包 打卡 打雷 打猎 打坐 打气 打盹 摔跤 着急 随便 吃豆腐 放鸽子 冒泡 死心 碰头
    受欢迎 圆梦 岔气 惹祸 闯祸 打钩 托福 点赞 落地 要脸 赔不是 走运 超车 致辞 出丑
    出差 出院 住校 问好 道谢 拜师 帮倒忙 伤脑筋 开小差 开绿灯 开后门 走弯路 走过场
    凑热闹 唱反调 绕圈子 兜圈子 打圆场 下功夫 费工夫 花工夫 碰运气 交白卷 拖后腿 泄气
    吃闭门羹 发电报 打电报`);
const COMPOSITIONAL = words(`
    吃饭 做饭 煮饭 喝水 喝茶 泡茶 喝酒 喝汤 喝咖啡 抽烟 吸烟 吃药 上药 服药 做菜 点菜
    买菜 炒菜 读书 看书 写字 写信 送信 回信 开灯 关灯 开门 关门 出门 进门 敲门 回家
    说话 讲话 谈话 搭话 废话 打电话 回电话 接电话 洗手 洗脸 刷牙 开车 坐车 上车 下车
    停车 骑车 修车 开会 买票 做作业 写作业 做笔记 记笔记 做报告 作报告 做实验
    做运动 看电影 看电视 洗衣服 洗碗 扫地 拖地 遛狗 钓鱼 跳绳 爬树 养花 骑马 划船 坐船
    晒太阳 剪头发 洗头 刮胡子 吃早饭 吃午饭 吃晚饭 做早饭 做晚饭 吃东西 买东西 交朋友
    交作业 交学费 交税 纳税 缴费 交费 收费 付费 开药 抓药 上厕所 发短信 发邮件 唱歌`);

// Complements of the potential forms V不C and V得C (看不见, 看得见, 想不起来).
// 会 only after 学 and 教 (学不会, 学得会): after other words 不会 is the
// modal (都不会, 将不会).
const COMPLEMENTS = words(`
    见 到 懂 完 开 动 住 着 起 来 去 上 下 进 出 回 过 清 清楚 明白 起来 下去 出来
    进来 进去 出去 回来 回去 上来 上去 下来 过来 过去 掉 走 透 光 惯 饱 满 齐 醒 赢
    倒 通 死 坏`);
const HUI_VERBS = chars('学 教');

// Characters after which 不C, 得C and 不了 do not make a potential form: the
// adverbs, pronouns and nouns of time that came first through these rules on
// Tatoeba and in Lu Xun's stories (都不会, 我不去, 我得去, 天不下, 再不见, 早不来,
// 以不上), and the other adverbs that come before 不.
const NOT_POTENTIAL = chars(`
    都 也 就 还 全 将 永 天 年 我 你 他 她 它 们 不 没 是 很 太 更 眼 再 早 以 面 从 决 绝 并 毫
    仍 尚 亦 皆 均 竟 怎 何 岂 偏 总 只 已 曾 正 刚 又 才 可`);
// Before 得 also the characters that form a word with it (变得, 觉得, 值得).
const NOT_POTENTIAL_DE = chars(`${NOT_POTENTIAL.join('')} 变 经 显 值 免 使 懂 觉 舍 晓 落 难 取 获 赢 博`);
// The verbs before 不了 (做不了, 去不了, 解决不了): only after a verb is 不了 the
// potential form; after other words it is often the start of 了解 or 了了之
// (都不了解, 互相不了解).
const LIAO_VERBS = chars(`
    ${ACTION_VERBS.join('')} 做 去 来 到 成 完 过 受 忍 决 制 握 止 变 害 当 任 定 明 饰 饶 付 治
    用 写 记 学 教 走 跑 飞 停 睡 忘 交 赢 输 救 修 买 卖 开 关 吃 喝 动 改 活 死 好 少 免 跑 办
    懂 等 找 说 讲 听 看 想 进 出 回 上 下 起 离 赶 追 管 控 逃 躲 穿 搬 拿 抓 站 坐 走 拖 扛 挡 帮`);

// Characters after which 儿 is not erhua but a word of its own (的儿子,
// 我儿子, 一个儿子, 女儿, 婴儿, 儿童): function words, pronouns, numerals, the
// words 儿 most often follows as 儿子, 儿女 or 儿童, and 莱 and 丽, after which
// it writes the end of a foreign name (克莱儿 Claire, 爱丽儿 Ariel).
const NOT_ERHUA = chars(`
    的 地 得 了 着 过 我 你 您 他 她 它 们 是 有 没 给 对 为 和 跟 与 在 把 被 让 叫 个
    两 一 二 三 四 五 六 七 八 九 十 几 生 养 大 小 女 男 孤 婴 幼 胎 健 宠 侄 孙 乳 少 新
    患 病 弃 混 托 育 合 理 现 道 吉 当 家 爱 宝 都 也 就 还 和 及 或 并 同 向 从 自 由 到
    帮 教 救 送 要 想 去 来 让 请 叫 带 养 生 死 打 骂 疼 抱 怀 亲 莱 丽`);

// --- Rules ---------------------------------------------------------------------
// The output of a rule names the part of speech of the dictionary form it
// gives: v, adj, n or pron. Neither recommended dictionary tags parts of
// speech (CC-CEDICT and wty-zh-en leave the rules column empty), so these
// conditions do not filter their terms (lookup.untaggedTerms "pass"); they
// decide which rules apply to a rule's output. Only the potential forms take
// another rule's output (看不看得见 → 看得见 → 看见); the output of erhua,
// whose 儿 ends the word, has no condition, so every rule applies to it
// (聊聊天儿 → 聊聊天 → 聊天).

const HAN = '[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u{20000}-\\u{2FFFD}\\u{30000}-\\u{3FFFD}]';
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    pron: {name: 'Pronoun', isDictionaryForm: true},
};
const cond = (conditionsIn, conditionsOut) => ({conditionsIn, conditionsOut});
const charClass = (list) => `[${[...new Set(list.flatMap(forms))].join('')}]`;
const stem = {stemMinLength: 1, stemCharacters: HAN};

function transform(id, name, description, rules) {
    const seen = new Set();
    const unique = rules.filter((rule) => {
        const key = JSON.stringify(rule);
        if (seen.has(key)) { return false; }
        seen.add(key);
        return true;
    });
    return {id, name, description, source: 'own', rules: unique};
}

const suffix = (inflected, deinflected, c, extra = {}) => ({type: 'suffix', inflected, deinflected, ...c, ...extra});
const whole = (inflected, deinflected, c) => ({type: 'wholeWord', inflected, deinflected, ...c});
const prefix = (inflected, deinflected, c, extra = {}) => ({type: 'prefix', inflected, deinflected, ...c, ...extra});

const charForms = (list) => [...new Set(list.flatMap(forms))];
const V = cond([], ['v']);
const VA = cond([], ['v', 'adj']);

const transforms = [];

transforms.push(transform('plural', 'plural 们', 'The plural suffix 们 after a person or a pronoun: 朋友们 → 朋友.',
    ['们', '們'].map((m) => suffix(m, '', cond([], ['n', 'pron']), stem))));

transforms.push(transform('erhua', 'erhua 儿', 'The retroflex suffix 儿 (erhua): 一点儿 → 一点, 玩儿 → 玩.',
    ['儿', '兒'].map((r) => suffix(r, '', cond([], []), {stemMinLength: 1, stemNotEndsWith: charClass(NOT_ERHUA)}))));

transforms.push(transform('aNotA', 'A-not-A question', 'A question that repeats a verb or adjective with 不 between: 好不好 → 好, 喜不喜欢 → 喜欢.', [
    ...charForms(NOT_A_MONO).map((a) => whole(`${a}不${a}`, a, VA)),
    ...NOT_A_DI.flatMap((word) => spellings(word).map((w) => whole(`${[...w][0]}不${w}`, w, VA))),
]));

transforms.push(transform('aMeiA', 'A-not-A question (没)', 'A question that repeats a verb with 没 between: 有没有 → 有, 吃没吃饭 → 吃饭.', [
    ...MEI_A_MONO.flatMap((a) => scripted(a).map(([script, x]) => whole(`${x}${script === 's' ? '没' : '沒'}${x}`, x, V))),
    ...MEI_A_DI.flatMap((word) => scripted(word).map(([script, w]) => whole(`${[...w][0]}${script === 's' ? '没' : '沒'}${w}`, w, V))),
]));

transforms.push(transform('redupAA', 'reduplication AA', 'A reduplicated verb (to do a little, to try) or adjective: 看看 → 看, 慢慢 → 慢.',
    charForms([...ACTION_VERBS, ...ADJECTIVES]).map((a) => whole(`${a}${a}`, a, VA))));

transforms.push(transform('redupAyiA', 'reduplication A一A', 'A verb reduplicated with 一 between, to do a little: 看一看 → 看, 想一想 → 想.',
    charForms(ACTION_VERBS).map((a) => whole(`${a}一${a}`, a, V))));

transforms.push(transform('redupAleA', 'reduplication A了A', 'A verb reduplicated with 了 between, done briefly: 看了看 → 看, 点了点头 → 点头.',
    charForms(ACTION_VERBS).map((a) => prefix(`${a}了${a}`, a, V))));

transforms.push(transform('redupAleyiA', 'reduplication A了一A', 'A verb reduplicated with 了一 between: 看了一看 → 看, 笑了一笑 → 笑.',
    charForms(LE_YI_VERBS).map((a) => whole(`${a}了一${a}`, a, V))));

transforms.push(transform('redupAAB', 'reduplication AAB', 'The verb of a verb-object compound reduplicated: 散散步 → 散步, 聊聊天 → 聊天.',
    AAB_COMPOUNDS.flatMap((word) => spellings(word).map((w) => whole([...w][0] + w, w, V)))));

transforms.push(transform('redupAABB', 'reduplication AABB', 'A disyllabic word reduplicated syllable by syllable: 高高兴兴 → 高兴, 干干净净 → 干净.',
    AABB_WORDS.flatMap((word) => spellings(word).map((w) => {
        const [a, b] = [...w];
        return whole(a + a + b + b, w, VA);
    }))));

transforms.push(transform('redupABAB', 'reduplication ABAB', 'A disyllabic verb or state adjective reduplicated whole: 研究研究 → 研究, 雪白雪白 → 雪白.',
    ABAB_WORDS.filter((w) => [...w].length === 2 && [...w][0] !== [...w][1])
        .flatMap((word) => spellings(word).map((w) => whole(w + w, w, VA)))));

transforms.push(transform('redupAliAB', 'reduplication A里AB', 'A disyllabic adjective reduplicated with 里 after its first syllable: 糊里糊涂 → 糊涂.',
    A_LI_AB_WORDS.flatMap((word) => scripted(word).flatMap(([script, w]) => {
        const [a] = [...w];
        return (script === 's' ? ['里'] : ['裡', '裏']).map((li) => whole(a + li + w, w, cond([], ['adj'])));
    }))));

// The words that may stand between the verb and the object: aspect markers
// and complements (了 过 着 完 好 起 不着 得了), numerals and measure words
// (一个 两次 三天 一会儿), demonstratives (这个 那些), adjectives (大 好), and
// possessors and question words (他的 我 自己的 什么 多少). The pattern takes
// one to six of them. A lookahead right after the verb keeps out the
// readings measured wrong on Tatoeba (sources/measure.py compare):
// - 的 right after the verb, or after anything but a possessor or a duration,
//   makes a relative clause or a modifier of a longer noun (做的事, 说过的话,
//   点三十分的火车); after a possessor or a duration it does not (生他的气,
//   服八年的刑, 睡了两个小时的觉);
// - 好, 小 and 白 right after the verb are an adjective of a longer noun or a
//   complement (做好事, 上小学, 说白话), and so is 大 in 大学 (上大学);
// - after 上 and 下, a numeral, a measure word or a demonstrative before 班,
//   课, 车, 站 or 节 means "the next" or "the last" (下一班, 下次课, 上一站);
// - a compositional compound (吃饭, 看书) is not separated by a demonstrative
//   (读这本书 is a verb and its object).
// An object that is also a measure word (口, 门, 年) may not follow a numeral
// or 多, 几, 些 (松了一口气, 开了三门课, 过了这么多年).
const t = (s) => [...new Set([...s.replace(/\s+/gu, '')].flatMap(forms))].join('');
const NUMERALS = `${t('一二两三四五六七八九十百千万半几多些')}0-9\\uFF10-\\uFF19`;
const WORD_CHARS = t(`
    了 过 着 完 好 起 上 到 成 掉 住 开 下 出 进 回 不 得 这 那 种 条 个 次 场 顿 口 会 儿 天 年
    夜 小 时 分 钟 头 趟 遍 阵 子 把 节 门 堂 句 封 张 杯 碗 盘 首 支 根 瓶 步 觉 月 周 星 礼 拜
    大 长 短 热 冷 新 老 白 我 你 您 他 她 它 咱 谁 们 自 己 别 人 家 的 什 么 啥 少 哪 很`);
// The classes of the stem constraints are written once, as named classes of
// language.json (zhNotPotential, ...), which the rules name. Patterns write
// their classes out: expanding a class reference in a pattern takes the
// engine about 0.1 ms, which for every pattern would make the pack load in
// about 50 ms instead of 12 (measured natively).
const RULE_CLASSES = {};
const named = (name, members) => {
    RULE_CLASSES[name] = `[${members}]`;
    return `{${name}}`;
};
const INSERTED = `[${WORD_CHARS}${NUMERALS}]{1,6}`;
const INSERTED_BEFORE_MEASURE = `[${WORD_CHARS}${NUMERALS}]{0,5}[${WORD_CHARS}]`;
const MEASURE_OBJECTS = new Set(t('口门年天次场顿把张本头节份件首支根盒包瓶期段番声眼步身个下'));
// Characters that may not stand right before an object, because with it they
// make another word or a measure word with its noun (见下面, 见过大场面, 碰那面
// 镜子).
const NOT_BEFORE = new Map([...spellings('面')].map((o) => [o, t('这那上下场')]));
const ADJ = `[${t('好小白')}]|${spellings('大学').join('|')}`;
const OTHER_DE = `[^的]*[^${t('我你您他她它咱谁们己家人年天月周时钟头个次')}的]的`;
const COMMON = `的|${ADJ}|${OTHER_DE}`;
const NEXT = `[${t('一二两三四五六七八九十几个次回场这那')}0-9\\uFF10-\\uFF19]`;
const DEMONSTRATIVE = `[^${t('这那')}]*[${t('这那')}]`;
// Every verb is one character, so the lookahead all verbs share is written
// once, after the first character: ^(?!.(?:...)).
const AFTER = {
    separable: '',
    compositional: `(?!${DEMONSTRATIVE})`,
    separableUpDown: `(?!${NEXT})`,
    compositionalUpDown: `(?!${NEXT}|${DEMONSTRATIVE})`,
};
const UP_DOWN = new Set(t('上下'));
const SEQUENCE_OBJECTS = new Set(t('班课车站节'));
const byObject = new Map();
for (const [kind, list] of [['separable', SEPARABLE], ['compositional', COMPOSITIONAL]]) {
    for (const word of list) {
        for (const w of spellings(word)) {
            const [v, ...o] = [...w];
            const object = o.join('');
            const key = UP_DOWN.has(v) && SEQUENCE_OBJECTS.has(object) ? `${kind}UpDown` : kind;
            if (!byObject.has(object)) { byObject.set(object, new Map()); }
            const groups = byObject.get(object);
            if (!groups.has(key)) { groups.set(key, new Set()); }
            groups.get(key).add(v);
        }
    }
}
const escape = (s) => s.replace(/[\\^$.*+?()[\]{}|/]/gu, '\\$&');
function insertedBefore(object) {
    if (NOT_BEFORE.has(object)) {
        const last = [...WORD_CHARS].filter((c) => !NOT_BEFORE.get(object).includes(c)).join('');
        return `[${WORD_CHARS}${NUMERALS}]{0,5}[${last}${NUMERALS}]`;
    }
    return MEASURE_OBJECTS.has(object) ? INSERTED_BEFORE_MEASURE : INSERTED;
}
transforms.push(transform('separable', 'separated verb-object', 'A verb-object compound with words between the verb and its object: 洗了个澡 → 洗澡, 生他的气 → 生气.',
    [...byObject].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([object, groups]) => {
        const alternatives = [...groups].sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([key, verbs]) => `(${[...verbs].sort().map(escape).join('|')})${AFTER[key]}`);
        return {
            type: 'pattern',
            pattern: `^(?!.(?:${COMMON}))(?:${alternatives.join('|')})${insertedBefore(object)}${escape(object)}$`,
            replacement: `${alternatives.map((_, i) => `$${i + 1}`).join('')}${object}`,
            anchorSuffix: object,
            ...V,
        };
    })));

// One rule per marker: 不 (or 得) is removed when it is the text's last 不
// and only complement characters follow it, and the text starts with the verb
// (the scanned text starts at the hovered character): 看不见 → 看见, 想不起来
// → 想起来. The first character may not be one of NOT_POTENTIAL (我不去, 天不下)
// nor 不 or 得 itself (不出来 is "not come out", 得清楚 the end of 说得清楚).
// 明白 and 清楚 have their own rules: 明, 白 and 楚 are not complements alone
// (说不明白 → 说明白, never 说明).
const TWO_PART = new Set(['明白', '清楚']);
const complementChars = `[${[...new Set(COMPLEMENTS.filter((c) => !TWO_PART.has(c)).flatMap((c) => [...c]).flatMap(forms))].join('')}]`;
const potentialStart = (marker, excluded) => ({
    stemNotStartsWith: named(marker === '不' ? 'zhNotPotential' : 'zhNotPotentialDe', [...new Set([...excluded, '不', '得'].flatMap(forms))].join('')),
});
const potential = (marker, excluded) => ({
    type: 'suffix', inflected: '', deinflected: '', ...cond(['v'], ['v']),
    stemMinLength: 3, ...potentialStart(marker, excluded),
    stemChange: {from: [marker], to: '', occurrence: 'last', between: complementChars},
});
const twoPart = (marker, excluded) => [...TWO_PART].flatMap((c) => spellings(c).map((cs) => suffix(`${marker}${cs}`, cs, cond(['v'], ['v']), {stemMinLength: 1, ...potentialStart(marker, excluded)})));
const hui = (marker) => HUI_VERBS.flatMap((v) => scripted(v).map(([script, x]) => {
    const h = script === 's' ? '会' : '會';
    return suffix(`${x}${marker}${h}`, `${x}${h}`, cond(['v'], ['v']));
}));
transforms.push(transform('potentialNot', 'potential 不', 'The potential form with 不, cannot: 看不见 → 看见, 听不懂 → 听懂.',
    [potential('不', NOT_POTENTIAL), ...twoPart('不', NOT_POTENTIAL), ...hui('不')]));

transforms.push(transform('potentialDe', 'potential 得', 'The potential form with 得, can: 看得见 → 看见, 听得懂 → 听懂.',
    [potential('得', NOT_POTENTIAL_DE), ...twoPart('得', NOT_POTENTIAL_DE), ...hui('得')]));

transforms.push(transform('potentialLiao', 'potential 不了', 'V不了, cannot (do it): 去不了 → 去, 来不了 → 来.',
    [suffix('不了', '', cond(['v'], ['v']), {stemMinLength: 1, stemEndsWith: charClass(LIAO_VERBS)})]));

const out = {schema: 1, conditions, wordLists: {}, transforms};
const file = join(here, 'own.json');
writeFileSync(file, formatTransforms(out));

// The named classes the rules use, in language.json's classes.
const languageFile = join(here, '..', 'language.json');
const language = JSON.parse(readFileSync(languageFile, 'utf8'));
language.classes = {...Object.fromEntries(Object.entries(language.classes).filter(([k]) => !k.startsWith('zh'))), ...RULE_CLASSES};
writeFileSync(languageFile, formatJson(language));
const count = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`${file}: ${transforms.length} transforms, ${count} rules`);
