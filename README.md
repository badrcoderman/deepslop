# 💥 DEEPSLOP — PS5 WebKit Exploit Kit

> 🔥 **WebKit RCE Dashboard** — أخر ما تدعمه نافذة WebKit على PS5 (FW 13.60)

🚀 كيت استغلال متصفح WebKit لجهاز PS5 (مشروع بحثي على جهاز خاص بالمستخدم)، مبني على
`slopkit-webkit-exploit-main` مع ترقيات جذرية:

🖥️ **واجهة تحكم جديدة** · 🔬 **وضع PROBE** · 🎯 **ماسح أوفستس ذاتي** ·
📡 **منارات BEACON** · 🛰️ **REPL loader** · 📦 **payloads على الجهاز

---

## ⚠️ نطاق الدعم

| 🎮 FW | نافذة WebKit RCE | Kernel exploit |
|---|---|---|
| **13.60** | ✅ **نعم — آخر نافذة** | ❌ لا (حتى 12.00 netctrl) |
| 9.00 – 10.01 | ✅ | ✅ lapse (AIO) |
| 4.03 – 12.00 | ✅ | ✅ netctrl (ucred) |

> 📌 **الخلاصة**: على 13.60 يوجد **RCE فقط** (لا جيلبريك كامل). ملفات kernel
> (`lapse-runtime.js`, `rop-worker.js`, `aioshellcode.js`) منقولة من slopkit2
> للرجوع إليها فقط وهي **غير موصولة** بالمسار الرئيسي.

---

## 📁 الملفات

```
deepslop/
├── ds-research-core.js   🧠 محرك الأبحاث الأساسي (telemetry, benchmarks, payloads)
├── research-dashboard.html 🖥️ Dashboard جديد (Glassmorphism) لتشغيل الحمولات
├── exploit.js            🧬 سلسلة الاستغلال الكاملة (WebKit RCE + ماسح الأوفستس)
├── remote.js             🛰️ WebSocket loader (REPL — يُحقن بعد RCE عبر مساحة _ds)
├── ws_server.py          ⚙️ خادم REPL + معالجة تقارير البحث (منفذ 50000)
├── research/payloads/    📦 31 حمولة بحثية مقسمة لـ 7 فئات مع `manifest.json`
├── tools/compare.js      ⚖️ أداة مقارنة تقارير الأداء بين التحديثات
├── offsets/              🗂️ offsets.json (23 FW)
├── rop-worker.js         🧵 staging ROP عبر worker (غير موصول)
├── host/                 🌐 أدوات استضافة DNS+HTTPS
└── cat.jpg               🐱 أصل غير مستخدم (مرجعي)
```

---

## 🔧 الإعداد المطلوب

> 🎮 **الوضع الافتراضي: بدون PC نهائيًا** — الاستغلال + payloads كلها على الجهاز.
> الـ PC اختياري (زر 📡 PC REMOTE في الواجهة) لتفعيل REPL عبر WebSocket، و`?pc=1`
> يفعّل منارة socket في سلسلة COMMIT.

1. **🏠 IP جهازك** (اختياري — للوضع البعيد فقط): عدّل `RCE_PC_IP` في
   `exploit.js:119` + fallback في `remote.js:16`.
2. **🔌 المنافذ** (للوضع البعيد فقط):
   - `50000` — `ws_server.py` (REPL + `POST /inject`)
   - `8080` — خادم HTTP ثابت يخدم `remote.js` و`offsets/`
     (مثال: `python3 -m http.server 8080 --directory deepslop`).
3. 🌐 رابط الاستغلال (مع أو بدون PC): `?go=1` يبدأ التشغيل تلقائيًا **بعد**
   تحميل الأوفستس.

---

## 🌍 النشر على GitHub Pages

> 🎉 **مباشر الآن**: `https://badrcoderman.github.io/deepslop/`

المستودع عام مع Pages مفعّلة من `main` — **الوضع الكامل يعمل من الاستضافة وحدها**:
استغلال → RCE → إشعار → payloads محلية (NOTIFY / SYSCALLS / REPORT / COMMIT /
محرر كود) — لا PC، لا خوادم:

```
🕹️ PS5 browser → https://badrcoderman.github.io/deepslop/?go=1&fw=13.60
```

🔌 **تفعيل PC REMOTE** (اختياري): زر 📡 في الواجهة يجلب `remote.js` من
`http://<PC>:8080` (mixed-content: على WebKit القديم غالبًا مسموح؛ إن فشل
`REMOTE-JS-FETCH-FAIL` استخدم خادم 8080 بترويسة CORS `*` أو النشر المحلي
`http://<PC>:8080/` — same-origin كامل).

---

## 🕹️ الاستخدام

```
# 💻 الطرفية 1 — الخادم
python3 ws_server.py

# 📨 الطرفية 2 — إرسال payload (بعد اتصال PS5)
python3 send_payload.py payloads/helloworld.js
python3 send_payload.py payloads/helloworld.js --host 192.168.1.50
```

### ⌨️ أوامر REPL في `ws_server.py`

| الأمر | الوصف |
|---|---|
| `research list` | 📋 عرض الحمولات المتوفرة |
| `research run <name>` | 🚀 تشغيل حمولة معينة |
| `research run-all` | ⚡ تشغيل جميع الحمولات المتوفرة |
| `research report` | 📄 سحب تقرير الأداء الشامل |
| `research capabilities`| 🔍 عرض قدرات المتصفح |
| `send <fichier.js>` | 📦 إرسال payload عادي |
| `offsets` / `scan` | 🎯 تقرير الأوفستس المكتشفة |
| `fire` | 💥 تشغيل `commitRce()` (crash renderer) |

### 🎛️ واجهة الأبحاث (`research-dashboard.html`)

تمت ترقية الواجهة إلى **Research Dashboard** متكاملة:
- 📊 **Telemetry**: تعرض معلومات النظام وقدرات الذاكرة بشكل مباشر.
- 🚀 **Payload Runner**: شبكة لتشغيل أي من الـ 31 حمولة بحثية.
- ⚡ **Run All**: تشغيل السلسلة كاملة واستخراج تقرير JSON شامل.

### 📦 الحمولات البحثية (31 Payload)

الحمولات مقسمة إلى 7 فئات أساسية (تُدار عبر `manifest.json`):
1. **Environment**: معلومات النظام، القدرات، دقة الساعة.
2. **Memory**: سرعة الحجز، أداء الـ GC، إمكانيات ArrayBuffer.
3. **WebKit**: كشف الـ JIT، أداء WebAssembly، قدرات DOM/Fetch.
4. **Network**: سرعة HTTP، استجابة WebSocket.
5. **Graphics**: أداء Canvas و WebGL و `requestAnimationFrame`.
6. **Process**: سرعة المعالج الأساسية، زمن استجابة الـ Event Loop.
7. **Stability**: فحص ثبات ثغرة structured-clone.

### 🧪 اختبار الماسح (`tools/scan-test.js`)

```
node tools/scan-test.js
```

يبني libkernel dump اصطناعيًا لكل FW من الـ 23 مع getpid/close في أوفستات
`offsets/offsets.json` + stubs إضافية وأفخاخ (رقم غير مشاهد / محاذاة خاطئة /
عنوان خاطئ) ويركض **نفس** `kernel-stubs.js` الذي يستخدمه `exploit.js` —
لا نسخة منفصلة. التزامن: غلاف `exploit.js` يستدعي الوحدة النقية، و Side
effects (`deepslopStubs`/`mark`) تبقى في الغلاف.

---

## 🧠 ميزانية الذاكرة (WebKit)

| 📊 عنصر | 🟢 عادي |
|---|---|
| carrier (float64) | 9,000,000 خانة ≈ **72MB** |
| سلسلة الأسر (captured string) | ≈ **144MB** |
| drain (keep-alive) | 512 × 64KB |
| slab 4MB | ✅ نعم |

> ℹ️ استُبعد وضع LOW_MEM عمدًا — الهدف PS5 فقط (لا قيد ذاكرة). القيم ثابتة
> على الأقصى لموثوقية الـ spray.

---

## 📜 سجل التغييرات

| الإصدار | التاريخ | أبرز ما فيه |
|---|---|---|
| 🔬 **v2.0.0** | 2026-08-11 | محرك أبحاث جديد (Research Framework) + واجهة Dashboard محدثة + 31 حمولة بحثية + أداة compare.js. |
| 📚 **v1.1.0** | 2026-08-10 | تحليل 8 مستودعات قديمة + دمج المراجع: `research/` (فئات ثغرات WebKit: angler · dfg · poc · maxu + عائلة structured-clone: jordy · userland_only) + `host/` (أدوات DNS/HTTPS spoof) |
| 🩹 **v1.0.1** | 2026-08-10 | مراجعة كاملة لكل ملف + إصلاح 9 أخطاء (أهمها `carrierSlots` وسباق `?go=1`) + حُرّاس FW + تحسينات خادم/واجهة |
| 🚀 **v1.0.0** | — | الإطلاق الأولي: Dashboard، PROBE mode، ماسح أوفستس ذاتي، LOW_MEM، BEACON، REPL |

📄 التفاصيل الكاملة في **[CHANGELOG.md](./CHANGELOG.md)**

## 🛡️ الأمان والحدود

- 🎓 للاستخدام البحثي على أجهزة تملكها فقط. الكيت يعدّل ذاكرة عملية المتصفح وقد
  يسبب أعطالًا — اختبر في بيئة معزولة.
- 🗑️ استبعاد ملفات kernel عن قصد: `netctrl/lapse/elfldr/kexp` (معطَّلة أو خارج
  نطاق 13.60) — راجع الكيتات الأصلية في `../slopkit2` إذا احتجت إليها.

---

## 📚 المصادر

- `slopkit-main`, `slopkit-webkit-exploit-main`, `slopkit2` — الكيتات الأصلية
- [WebKit/WebKit](https://github.com/WebKit/WebKit) — مرجع دراسة JSC (تتبع
  الرقع الأمنية)
- 🌐 **الموقع**: [https://badrcoderman.github.io/deepslop/](https://badrcoderman.github.io/deepslop/)
