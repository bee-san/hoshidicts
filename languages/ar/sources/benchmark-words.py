#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Writes sources/benchmark-words.txt: the lookup texts the performance
numbers of README.md time, one per line.

    python3 languages/ar/sources/benchmark-words.py

The sentences are written for this pack. Each word of each sentence gives one
text, from the word to the end of its sentence, as a host looks a hovered word
up (docs/languages.md 9.1); benchmark-lookup reads the part of each line
before its first comma, so the sentences have none (Arabic writes ، instead).
"""
from pathlib import Path

SENTENCES = [
    'ذهبتُ إلى المكتبة واستعرتُ كتابين جديدين.',
    'سيكتبون رسائلهم إلى أصدقائهم غدًا.',
    'قالت المعلمة إن الطلاب لم يفهموا الدرس.',
    'وجدنا مفاتيحنا في السيارة بعد أن بحثنا عنها طويلًا.',
    'هل تستطيعين أن تساعديني في ترتيب هذه الأوراق؟',
    'كانت المدينة هادئة عندما وصلنا إليها في المساء.',
    'لا تنسَ أن تتصل بأمك قبل أن تنام.',
    'اشترى أخي حاسوبًا جديدًا ليستخدمه في عمله.',
    'يقولون إن الأطفال يتعلمون اللغات بسرعة.',
    'فتحتُ النوافذ لأن الغرفة كانت حارة.',
    'رأيتهم يلعبون في الحديقة مع أبنائهم.',
    'سنزور جدتنا في القرية خلال العطلة الصيفية.',
    'أعطيته الكتاب الذي طلبه مني أمس.',
    'والمسافرون ينتظرون القطار منذ ساعتين.',
    'لماذا لم تخبروني بأنكم ستسافرون؟',
    'تعلمتُ الطبخ من والدتي عندما كنتُ صغيرة.',
    'فكرنا في المشكلة ثم قررنا أن نبدأ من جديد.',
    'يحب المهندسون أن يعملوا في مشاريع كبيرة.',
    'ادخلوا البيت وأغلقوا الباب خلفكم.',
    'استمعتُ إلى الأخبار وفهمتُ ما حدث في البلاد.',
]


def main():
    lines = []
    for sentence in SENTENCES:
        words = sentence.split(' ')
        for i in range(len(words)):
            lines.append(' '.join(words[i:]))
    out = Path(__file__).with_name('benchmark-words.txt')
    out.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('%s: %d texts from %d sentences' % (out, len(lines), len(SENTENCES)))


if __name__ == '__main__':
    main()
