# research/ — مراجع لتحسين استغلال WebKit على 13.60

مصدر: `/home/user/Documents/webp5/other&old-explolts/` — مسح كامل لـ 8 مستودعات
(+ جولة ثانية على كل مجلدات zecoxao الـ ~60). الفلتر هنا **صارم**: ما يحسّن
سلسلة استغلال WebKit نفسها فقط (سلسلتنا: structured-clone → addrof/fakeobj →
R/W → ROP).

## فئات ثغرات WebKit/JSC — بدائل أو معززات للسلسلة

| الملف | الفئة | إمكانية التحسين لنا |
|---|---|---|
| `angler/index.html` | **CVE-2025-43529**: DFG Phi-escape + inline-slot PAC bypass → R/W + **ANGLE oracle** (توقيت GL لكشف تخطيط الهيب) | R/W بديل + ANGLE oracle يمكن أن يحسّن **موثوقية feng-shui** |
| `poc/index.html` | تناقض DFG/FTL: EnumeratorNextUpdateIndexAndMode + HasIndexedProperty | فئة JIT ثانية محتملة |
| `dfg/index.html` | UAF من DFG store-barrier/Phi → butterfly reclaim → addrof/fakeobj (ftoi) | addrof/fakeobj بطريقة مختلفة |
| `genericTypedArray/index.html` | فئة typed-array في JSC | فئة ثالثة محتملة |
| `get_by_id_with_this/index.html` | فئة `GetByIdWithThis` في DFG | مرجع |
| `bushigan/index.html` | فئة إضافية (مرفقاتها غير منقولة) | مرجع |
| `maxu/index.html` | **CVE-2025-24201** tester (تسريب UA/WebKit) | كشف هوية بناء WebKit على الجهاز بدقة |

## عائلة سلسلتنا (structured-clone — الأقرب تحسينًا)

| الملف | ما يقدمه لسلسلتنا |
|---|---|
| `jordy/index.html` | بوتستراب 616.1 مع **validation صارم** قبل كل استخدام — نمط يمكن نقله لتحصين exploit.js |
| `userland_only/index.html` | نفس العائلة، نسخة مبسطة — أسهل للمقارنة سطرًا بسطر مع bootstrap لدينا |

## حُذف بموجب الفلتر

- `kexp/` — مرحلة kernel، ليست WebKit.
- `int64.js`/`rop.js` (PS5-Webkit-Execution) — أدوات عامة، سلسلتنا لها بديلها.
- سلاسل ≤12.00، مسربات 11.60، مواد PS4، وسائط، مستودعات كاملة.

الأصل كله محفوظ في `other&old-explolts/` لأي مراجعة لاحقة.
