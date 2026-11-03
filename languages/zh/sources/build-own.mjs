#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/zh/sources/own.json: the Chinese deinflection rules written
// for this pack (docs/languages.md, section 14 step 2). Run from the
// repository root:
//
//   node languages/zh/sources/build-own.mjs [--unihan <Unihan_Variants.txt>] [--freq <zh_tw_50k.txt>]
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
// characters; every literal is also written in each traditional form Unihan
// gives it (kTraditionalVariant, Unicode 17.0) that is in use, which this
// script decides with a frequency list of traditional-character subtitles
// (FrequencyWords zh_tw_50k). No dictionary is read.
//
// Neither recommended dictionary gives part-of-speech tags in its `rules`
// column, and a deinflection with conditions only finds terms whose tags
// match them (section 9.4), so every rule has empty conditions.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = '/local/home/skerraut/herd-synth3/clones/hachi-lang-cache/zh';
const argument = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : fallback;
};
const UNIHAN = argument('--unihan', join(CACHE, 'Unihan_Variants.txt'));
const FREQ = argument('--freq', join(CACHE, 'zh_tw_50k.txt'));

// --- Traditional forms ----------------------------------------------------
// The traditional forms of a simplified character are its kTraditionalVariant
// values and the characters whose kSimplifiedVariant it is. A form is kept
// when traditional-character subtitles use it at least 5% as often as the
// character's most frequent form, so 发 gives 發 and 髮, 后 gives 後 and 后,
// and 只 gives 只 and 隻 but not 衹. 着 also keeps 着 itself, which Hong Kong
// text writes for 著, and 净 gives both 淨 and 凈 (Unihan gives only 凈).

const forward = new Map();
const inverse = new Map();
for (const line of readFileSync(UNIHAN, 'utf8').split('\n')) {
    if (line.startsWith('#') || line.trim() === '') { continue; }
    const [cp, field, value] = line.split('\t');
    if (field !== 'kTraditionalVariant' && field !== 'kSimplifiedVariant') { continue; }
    const c = String.fromCodePoint(parseInt(cp.slice(2), 16));
    const values = value.split(' ').map((v) => String.fromCodePoint(parseInt(v.slice(2), 16)));
    if (field === 'kTraditionalVariant') {
        forward.set(c, values);
        continue;
    }
    for (const simplified of values) {
        if (simplified === c) { continue; }
        if (!inverse.has(simplified)) { inverse.set(simplified, []); }
        inverse.get(simplified).push(c);
    }
}
const frequency = new Map();
for (const line of readFileSync(FREQ, 'utf8').split('\n')) {
    const space = line.lastIndexOf(' ');
    if (space < 0) { continue; }
    const count = Number(line.slice(space + 1));
    for (const c of line.slice(0, space)) { frequency.set(c, (frequency.get(c) ?? 0) + count); }
}
const EXTRA = new Map([['着', ['着', '著']], ['净', ['淨', '凈']]]);

/** The traditional forms in use of a simplified character (itself when it has none). */
function tradForms(c) {
    if (EXTRA.has(c)) { return EXTRA.get(c); }
    const candidates = [...new Set([...(forward.get(c) ?? []), ...(inverse.get(c) ?? [])])];
    if (candidates.length === 0) { return [c]; }
    const counted = candidates.map((v) => [v, frequency.get(v) ?? 0]);
    const top = Math.max(...counted.map(([, n]) => n));
    return counted.filter(([, n]) => n === top || (n >= 50 && n >= top * 0.05)).map(([v]) => v);
}

/** A character and its traditional forms. */
const forms = (c) => [...new Set([c, ...tradForms(c)])];

/** The traditional spellings of a simplified string (at most 8). */
function tradSpellings(text) {
    let out = [''];
    for (const c of text) {
        out = out.flatMap((prefix) => tradForms(c).map((f) => prefix + f));
        if (out.length > 8) { out = out.slice(0, 8); }
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

// Monosyllabic action verbs that reduplicate as AA, A一A, A了A and A了一A
// (看看, 看一看, 看了看, 看了一看), and that take A没A (吃没吃).
const ACTION_VERBS = chars(`
    看 想 试 走 尝 听 说 谈 问 坐 歇 等 找 查 算 读 写 学 玩 聊 逛 跑 跳 唱
    洗 擦 扫 收 拿 放 摸 拍 揉 抱 亲 闻 笑 哭 叫 喊 劝 帮 教 讲 练 改 修 补 理
    整 弄 搞 动 摇 点 挥 招 转 翻 比 量 称 数 猜 考 评 选 送 借 还 买 吃 喝 品
    晒 泡 烤 煮 炒 切 剪 梳 刷 抹 涂 画 描 填 签 包 装 搬 挪 推 拉 提 抬 举 扶
    牵 拖 捏 敲 打 踢 碰 踩 跺 蹲 站 躺 靠 趴 爬 滚 游 飞 吹 扇 冲 浇 倒 洒 撕
    扯 扔 甩 抖 晃 摆 挂 贴 绑 绕 卷 折 叠 铺 盖 遮 挡 藏 躲 瞧 瞅 望 盯 瞪 眨
    睁 闭 张 舔 咬 嚼 吐 吸 叹 哼 骂 夸 谢 求 请 催 逗 哄 陪 盼 熬 忍 让 管 顾
    照 守 护 养 喂 遛 溜 闯 赶 追 跟 接 迎 见 访 拜 敬 祝 贺 乐 闹 吵 争 抢 偷
    骗 吓 怪 罚 奖 赏 捧 托 顶 撑 压 按 捶 戳 挠 抓 掏 挑 捡 摘 种 割 砍 劈 磨
    捂 瞄 晾 熨 缝 织 揍 抽 踹 蹭 扒 拌 搅 掰 掂 蘸 搓 舀 盛 端 递 捎 寄 发 回
    退 换 分 合 凑 拼 粘 涮 淋 炖 蒸 煎 炸 烧 背 扛 担 拎 夹 揪 拽 拔 掐 扭 拧
    撬 掀 揭 撩 拂 抚 叩 弹 拨 挤 捅 扎 剁 削 刮 钻 砸 摔 撞 磕 踏 跨 迈 蹦 窜
    逃 奔 闪 埋 挖 搜 寻 探 瞥 眯 吼 嚷 念 答 逼 表 想 做 用 穿 戴 脱 开 关 擦
    写 记 背 谈 讨 商 研 休 歇 动 活 练 跑 遛 晃 转 坐 卧 待 呆 住 尝 闻 嗅`);

// Monosyllabic adjectives that reduplicate as AA (慢慢, 好好, 红红).
const ADJECTIVES = chars(`
    慢 好 快 早 远 轻 重 深 满 甜 香 软 静 冷 热 暖 凉 胖 瘦 圆 细 厚 薄 亮 弯
    直 乖 美 高 矮 短 长 大 小 红 白 黑 蓝 绿 黄 紫 尖 平 稳 松 紧 干 湿 旧 新
    多 少 淡 浓 傻 呆 憨 笨 嫩 老 闲 忙 乱 足 狠 活 硬 脆 酥 辣 酸 咸 苦 香 臭
    鲜 肥 壮 娇 俏 帅 醉 晕 空 亮 暗 偷 默 久 牢 死 苦`);

// The first characters of the A-not-A question, A不A and A不AB: verbs,
// adjectives, modal verbs, and the first syllable of common disyllabic verbs
// and adjectives (喜不喜欢, 知不知道, 可不可以, 漂不漂亮).
const A_NOT_A = chars(`
    ${ACTION_VERBS.join('')} ${ADJECTIVES.join('')}
    是 有 对 行 要 能 会 可 应 该 敢 肯 愿 想 得 配 值 需 必 准 许 够 像 在 当
    喜 知 认 舒 漂 清 明 习 同 相 觉 容 安 幸 合 熟 担 害 注 准 决 懂 介 着 生
    难 厉 舍 讨 了 理 支 赞 反 允 承 参 出 进 结 离 毕 上 下 来 去 过 起 适 方
    便 简 复 麻 辛 痛 健 危 严 贵 近 累 饿 渴 困 饱 聪 年 精 温 真 正 公 自 随
    普 特 主 情 甘 演 带 住 睡 告 给 怕 恨 爱 信 疼 痒 奇 愉 称 顺 成 及 原 感
    满 熟 高 漂 舒 方 干 认 喜 知 欢 记 晓 懂 同 答 接 考 关 介 在 放 重 紧 轻
    危 麻 简 复 辛 健 严 正 普 特 主 必 必 有 乐 开 好 难`);

// Verbs that take A没A (有没有, 去没去, 吃没吃饭).
const A_MEI_A = chars(`${ACTION_VERBS.join('')} 有 到 见 完 交 去 来 做 用 带 拿 回 发 睡 起 上 下 进 出 结 离 毕`);

// Verb-object compounds whose verb reduplicates as AAB (散散步, 聊聊天).
const AAB_COMPOUNDS = words(`
    散步 聊天 跳舞 唱歌 洗澡 洗手 洗脸 刷牙 理发 照相 跑步 游泳 睡觉 压惊 消气
    叹气 帮忙 见面 握手 招手 挥手 拍手 点头 摇头 抬头 低头 转身 弯腰 伸腰 散心
    谈心 透气 吹风 喝茶 下棋 打球 逛街 看书 写字 读书 上网 泡脚 跺脚 动手 动脑
    尝鲜 解闷 解馋 歇脚 遛狗 跑腿 发呆 跳绳 打牌 钓鱼 爬山 骑车 兜风 串门 做饭
    喝酒 擦汗 擦嘴 眨眼 揉眼 晒太阳 打招呼 开玩笑 出主意 发牢骚 冲凉 练字 养花
    做梦 做操 洗碗 扫地 拖地 搓手`);

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

// Separable verb-object compounds: a verb of one character and its object.
// Words can stand between them (洗了个澡, 生他的气, 睡不着觉, 见过几次面).
const SEPARABLE = words(`
    睡觉 洗澡 冲澡 泡澡 帮忙 见面 碰面 会面 结婚 离婚 求婚 订婚 毕业 就业 游泳
    唱歌 跳舞 散步 跑步 让步 聊天 谈天 请客 上课 下课 讲课 逃课 选课 备课 代课
    补课 听课 考试 照相 拍照 理发 打针 发烧 担心 伤心 放心 操心 散心 谈心 费心
    分心 生气 叹气 出气 受气 泄气 赌气 喘气 消气 透气 憋气 吃饭 做饭 煮饭 蹭饭
    要饭 吵架 打架 劝架 放假 请假 休假 度假 排队 插队 道歉 鞠躬 握手 招手 挥手
    拍手 洗手 动手 分手 插手 举手 撒手 放手 起床 刷牙 洗脸 丢脸 翻脸 开车 坐车
    上车 下车 停车 堵车 骑车 修车 开会 上班 下班 加班 值班 换班 上学 放学 留学
    退学 逃学 看病 生病 治病 住院 出院 报名 出名 签名 点名 录音 滑冰 溜冰 爬山
    登山 上山 下山 花钱 赚钱 挣钱 借钱 还钱 付钱 换钱 找钱 存钱 取钱 收钱 交钱
    省钱 出事 办事 有事 没事 做事 管事 懂事 闹事 惹事 下雨 下雪 刮风 吹风 上当
    说话 讲话 谈话 搭话 废话 打电话 回电话 接电话 开玩笑 打招呼 打交道 出主意
    拿主意 打主意 占便宜 吃醋 吃亏 吃苦 受苦 吃惊 受惊 受罪 犯罪 赔罪 遭罪 点头
    摇头 带头 低头 回头 磕头 抬头 剃头 皱眉 耸肩 眨眼 睁眼 闭眼 瞪眼 张嘴 闭嘴
    插嘴 还嘴 顶嘴 亲嘴 斗嘴 拌嘴 开口 张口 漱口 改口 松口 打球 踢球 下棋 打牌
    看戏 演戏 唱戏 读书 看书 念书 教书 写字 签字 识字 打字 写信 送信 回信 开灯
    关灯 开门 关门 出门 进门 敲门 串门 回家 搬家 成家 当家 过年 拜年 过节 喂奶
    断奶 喝水 喝茶 泡茶 喝酒 敬酒 抽烟 吸烟 吃药 上药 服药 做菜 点菜 买菜 炒菜
    讲价 砍价 涨价 降价 买票 投票 检票 退票 上网 挂号 对号 排号 合影 破例 举例
    表态 服刑 判刑 付款 存款 取款 贷款 结账 算账 记账 买单 埋单 下单 出力 用力
    尽力 费力 使劲 费劲 起劲 走神 出神 分神 留神 加油 出汗 流汗 流血 出血 献血
    抽血 流泪 掉泪 受伤 冒险 辞职 任职 就职 打工 上工 开工 收工 罢工 做工 当兵
    当官 做官 做生意 做梦 做主 作主 做操 作弊 做手术 动手术 做作业 写作业 做笔记
    记笔记 做报告 作报告 做实验 做运动 化妆 整容 失踪 搁浅 洗礼 送礼 行礼 敬礼
    分类 借火 发火 生火 点火 着火 开户 打赌 打折 充电 停电 享福 生根 出国 回国
    吃素 告状 报案 破案 作案 保密 告密 泄密 发财 发言 发誓 发呆 发疯 发愁 发脾气
    发牢骚 发短信 发芽 接吻 鼓掌 拍戏 看电影 看电视 上台 下台 上岗 下岗 退休 入伍
    参军 掌权 用心 用功 吃苦头 拍马屁 吹牛 吹牛皮 走后门 开夜车 泼冷水 碰钉子
    打哈欠 打喷嚏 打瞌睡 打官司 打仗 打车 打包 打卡 打雷 打猎 打坐 打气 打水 打饭
    洗衣服 洗碗 扫地 拖地 遛狗 钓鱼 跳绳 爬树 养花 骑马 划船 坐船 晒太阳 剪头发
    洗头 刮胡子 吃早饭 吃午饭 吃晚饭 做早饭 做晚饭 吃东西 买东西 喝咖啡 喝汤
    唱卡拉OK 交朋友 交作业 交学费 交税 纳税 缴费 交费 收费 付费 免费 开药 抓药`);

// Words that may stand between the verb and the object of a separable
// compound: aspect and phase markers (了 过 着 完 好 起), potential
// complements (不着, 得了, 不上), numerals and measure words (一个, 两次,
// 三天, 一会儿), demonstratives, pronouns with 的 (他的, 自己的), question
// words (什么, 多少) and a few modifiers (好, 大). The pattern takes one to
// six of them.
const INSERTED = chars(`
    了 过 着 完 好 起 上 下 到 出 进 回 来 去 住 掉 不 得 一 二 两 三 四 五 六 七 八 九 十 百 千 万
    几 半 这 那 哪 每 个 次 场 顿 口 会 儿 天 夜 年 晚 小 时 分 钟 趟 遍 阵 子 把 节 门 堂
    句 封 张 辆 杯 碗 盘 份 件 首 支 根 盒 包 瓶 本 期 段 番 声 我 你 您 他 她 它 咱 们 谁
    人 家 大 别 自 己 的 什 么 啥 多 少`);

// Complements of the potential form V不C and V得C (看不见, 看得见).
const COMPLEMENTS = words(`
    见 到 懂 完 会 开 动 住 着 起 来 去 上 下 进 出 回 过 清 清楚 明白 起来 下去 出来
    进来 进去 出去 回来 回去 上来 上去 下来 过来 过去 掉 走 透 光 惯 饱 满 齐 醒 赢
    倒 通 死 坏`);

// --- Rules ---------------------------------------------------------------------

const HAN = '[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u{20000}-\\u{2FFFD}\\u{30000}-\\u{3FFFD}]';
const NONE = {conditionsIn: [], conditionsOut: []};
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

const suffix = (inflected, deinflected, extra = {}) => ({type: 'suffix', inflected, deinflected, ...NONE, ...extra});
const prefix = (inflected, deinflected, extra = {}) => ({type: 'prefix', inflected, deinflected, ...NONE, ...extra});
const whole = (inflected, deinflected) => ({type: 'wholeWord', inflected, deinflected, ...NONE});

const charForms = (list) => [...new Set(list.flatMap(forms))];

const transforms = [];

transforms.push(transform('plural', 'plural 们', 'The plural suffix 们 after a person or a pronoun: 朋友们 → 朋友.',
    ['们', '們'].map((m) => suffix(m, '', stem))));

transforms.push(transform('erhua', 'erhua 儿', 'The retroflex suffix 儿 (erhua): 一点儿 → 一点, 玩儿 → 玩.',
    ['儿', '兒'].map((r) => suffix(r, '', stem))));

transforms.push(transform('aNotA', 'A-not-A question', 'A question that repeats a verb or adjective with 不 between: 好不好 → 好, 喜不喜欢 → 喜欢.',
    charForms(A_NOT_A).map((a) => prefix(`${a}不${a}`, a))));

transforms.push(transform('aMeiA', 'A-not-A question (没)', 'A question that repeats a verb with 没 between: 有没有 → 有, 吃没吃饭 → 吃饭.',
    A_MEI_A.flatMap((a) => scripted(a).map(([script, x]) => prefix(`${x}${script === 's' ? '没' : '沒'}${x}`, x)))));

transforms.push(transform('redupAA', 'reduplication AA', 'A reduplicated verb (to do a little, to try) or adjective: 看看 → 看, 慢慢 → 慢.',
    charForms([...ACTION_VERBS, ...ADJECTIVES]).map((a) => whole(`${a}${a}`, a))));

transforms.push(transform('redupAyiA', 'reduplication A一A', 'A verb reduplicated with 一 between, to do a little: 看一看 → 看, 想一想 → 想.',
    charForms(ACTION_VERBS).map((a) => prefix(`${a}一${a}`, a))));

transforms.push(transform('redupAleA', 'reduplication A了A', 'A verb reduplicated with 了 between, done briefly: 看了看 → 看, 点了点头 → 点头.',
    charForms(ACTION_VERBS).map((a) => prefix(`${a}了${a}`, a))));

transforms.push(transform('redupAleyiA', 'reduplication A了一A', 'A verb reduplicated with 了一 between: 看了一看 → 看, 笑了一笑 → 笑.',
    charForms(ACTION_VERBS).map((a) => prefix(`${a}了一${a}`, a))));

transforms.push(transform('redupAAB', 'reduplication AAB', 'The verb of a verb-object compound reduplicated: 散散步 → 散步, 聊聊天 → 聊天.',
    AAB_COMPOUNDS.flatMap((word) => spellings(word).map((w) => {
        const v = [...w][0];
        return prefix(v + w, w);
    }))));

transforms.push(transform('redupAABB', 'reduplication AABB', 'A disyllabic word reduplicated syllable by syllable: 高高兴兴 → 高兴, 干干净净 → 干净.',
    AABB_WORDS.flatMap((word) => spellings(word).map((w) => {
        const [a, b] = [...w];
        return whole(a + a + b + b, w);
    }))));

transforms.push(transform('redupABAB', 'reduplication ABAB', 'A disyllabic verb or state adjective reduplicated whole: 研究研究 → 研究, 雪白雪白 → 雪白.',
    ABAB_WORDS.filter((w) => [...w].length === 2 && [...w][0] !== [...w][1])
        .flatMap((word) => spellings(word).map((w) => whole(w + w, w)))));

transforms.push(transform('redupAliAB', 'reduplication A里AB', 'A disyllabic adjective reduplicated with 里 after its first syllable: 糊里糊涂 → 糊涂.',
    A_LI_AB_WORDS.flatMap((word) => scripted(word).flatMap(([script, w]) => {
        const [a] = [...w];
        return (script === 's' ? ['里'] : ['裡', '裏']).map((li) => whole(a + li + w, w));
    }))));

// One `pattern` rule per object, anchored on it: the verbs that take the
// object, then one to six inserted words, then the object.
const insertedClass = `[${charForms(INSERTED).join('')}0-9\\uFF10-\\uFF19]`;
const byObject = new Map();
for (const word of SEPARABLE) {
    for (const w of spellings(word)) {
        const [v, ...o] = [...w];
        const object = o.join('');
        if (!byObject.has(object)) { byObject.set(object, new Set()); }
        byObject.get(object).add(v);
    }
}
const escape = (s) => s.replace(/[\\^$.*+?()[\]{}|/]/gu, '\\$&');
transforms.push(transform('separable', 'separated verb-object', 'A verb-object compound with words between the verb and its object: 洗了个澡 → 洗澡, 生他的气 → 生气.',
    [...byObject].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([object, verbs]) => ({
        type: 'pattern',
        pattern: `^(${[...verbs].sort().map(escape).join('|')})${insertedClass}{1,6}${escape(object)}$`,
        replacement: `$1${object}`,
        anchorSuffix: object,
        ...NONE,
    }))));

transforms.push(transform('potentialNot', 'potential 不', 'The potential form with 不, cannot: 看不见 → 看见, 听不懂 → 听懂.',
    COMPLEMENTS.flatMap((c) => spellings(c).map((cs) => suffix(`不${cs}`, cs, stem)))));

transforms.push(transform('potentialDe', 'potential 得', 'The potential form with 得, can: 看得见 → 看见, 听得懂 → 听懂.',
    COMPLEMENTS.flatMap((c) => spellings(c).map((cs) => suffix(`得${cs}`, cs, stem)))));

transforms.push(transform('potentialLiao', 'potential 不了', 'V不了, cannot (do it): 去不了 → 去, 来不了 → 来.',
    [suffix('不了', '', stem)]));

const out = {schema: 1, conditions: {}, wordLists: {}, transforms};
const file = join(here, 'own.json');
writeFileSync(file, formatTransforms(out));
const count = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`${file}: ${transforms.length} transforms, ${count} rules`);
