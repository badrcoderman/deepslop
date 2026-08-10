# 📜 سجل التغييرات (Changelog)

> تنسيق [Keep a Changelog](https://keepachangelog.com/) — كل ما هو قابل للتغيير
> موثّق هنا، والـ README يعرض ملخصًا سريعًا فقط.

---

## 🩹 v1.0.1 — مراجعة كاملة + إصلاحات (2026-08-10)

فحص كل ملف سطرًا بسطر (دوال الاستغلال، الواجهة، الخادم، payloads، الأوفستس)
وتثبيت مهارات البحث: `webkit-jsc-exploit-research` (مخصصة) +
`performing-binary-exploitation-analysis` + `performing-fuzzing-with-aflplusplus`.

### 🐛 أخطاء أُصلحت — `exploit.js`

- 🔴 **HIGH** `carrierSlots` غير معرَّف (ReferenceError مُبتلَع) في
  `exposeDeepslopGlobals` و`deepslopMemEstimate` — كان يمنع
  `window.deepslopInfo` بالكامل → أُصلح إلى `CARRIER_SLOTS`.
- 🟠 **MED** `readTrampolineBytes` كان يقرأ 10 بايت ويقارنها بسلسلة 17 بايت —
  يعرض "(mismatch)" دائمًا → الحلقة الآن `i < 17`.
- 🟡 **LOW** `navigator.userAgent` غير محروس عند الإقلاع (يفسد كل شيء في Node).
- 🟡 **LOW** `requestAnimationFrame` خارج try/catch → حارس + بديل `setTimeout`.
- 🟡 **LOW** فحص GOT "read-twice" كان يقرأ من نفس التوجيه (صحيح دائمًا) →
  `aimCarrier` يعاد قبل كل قراءة ثانية.

### ✨ تحسينات — `exploit.js`

- `deepslopScan` يُصفَّر في `resetAttemptState` (لا فحص قديم بين المحاولات).
- تنظيف كامل لذاكرة probe (`capturedString/capturedWords/keepAlive/...`).
- `initKernel()` و`sendNotifNatural()` داخل try/catch مع `mark` بدل الفشل الصامت.
- `window.commitRce` أصبح مكشوفًا (عقد REPL موثوق بدل الاعتماد على eval المباشر).
- نهاية نافذة الفحص `endRva` مشبوكة بـ `WEBKIT_RELRO_END` (لا قراءة خارج RELRO).
- `fetch` بلا `cache:"no-store"` (غير موثوق على WebKit القديم) → cache-busting
  بـ `?v=REVISION` في الـ URL.
- إزالة سجل `RW-HEADER-HEX` المكرر؛ شعار `offline-verified-fw` أصبح ديناميكيًا
  من `FW_LABEL`.

### 🐛 أخطاء أُصلحت — `index.html`

- 🔴 **HIGH** سباق `?go=1`: كان التشغيل التلقائي يسبق جلب الأوفستس (تسرب أوفستس
  11.60 افتراضية لأي FW) → `autoRunNow()` يُستدعى بعد انتهاء الجلب في كل المسارات.
- 🟠 **MED** زرا RUN/PROBE يبقيان معطلين بعد النجاح → يُعاد تفعيلهما في `ok`.
- 🟡 **MED-LOW** فرع "auto-retry" الميت (يُقيَّم بعد التعيين دائمًا) → فحص قبل
  التعيين برسالة صادقة "reload the page to run again".
- 🟡 **LOW** رفض `navigator.clipboard` غير مُلتقَط → `.then/.catch` + فحص الوجود.
- ✅ إضافة العناصر المخفية `#cap`/`#cat`/`#scr` (كانت `setCaption/catState/screenLine`
  تفشل بصمت على الصفحة الحقيقية) + favicon (`data:,`).

### 🛠️ إصلاحات — الخادم/العميل

- `ws_server.py`: مراقب انقطاع (watcher) يعمل حتى عندما يكون REPL محجوبًا في
  `input()`؛ رفض PS5 ثانية برسالة close؛ معالجة `ready` المتأخر؛ استهلاك منارة
  ROP (`PS5_RCE_OK` بدل إغلاق صامت)؛ تحقق `isinstance(msg, dict)` في `/inject`؛
  توثيق خادم 8080 في الرأس.
- `remote.js`: `resolve`/`mem` يرسلان `status:"error"` عند الفشل الحقيقي (كان
  "ok" زائفًا)؛ حذف متغير `kb` الميت.
- `send_payload.py`: خيارات `--host`/`--port` (+ متغير بيئة `PS5_SERVER`).
- `payloads/deepslop_info.js`: `?? "none"` بدل سلسلة `"undefined"`.
- 🛡️ **حُرّاس FW** في ملفات kernel: `lapse-runtime.js` يرفض أي FW خارج 9.00–10.01
  برسالة نظيفة؛ `rop-worker.js` يرفض أي FW غير 10.00 قبل أي قراءة من الخيط
  القاتل (walk قبل self-checks كان يقرأ عنوانًا غير معيّن)؛ ثابت
  `LK_SYSCALL_WRAPPER` باسمه + تعليق توثيقي للخلاف مع lapse-offsets.
- `rop-worker.js`: تعطيل `W.batchBuf` عند `allocReset()` (فساد صامت للسلسلة)؛
  حارس `W.worker` في `ping()` + `worker.onerror`؛ مهلة جدار زمنية 10s لـ fireSync.
- `aioshellcode.js`: عنوان بارز يوضح أنه كود قديم غير موصول بمراجع مفقودة.
- 🧹 حذف `__pycache__/` + إضافة `.gitignore`.

### ✅ التحقق

`node --check` على كل ملفات JS · `py_compile` · صلاحية JSON · اختبارات تحميل
بمحاكاة DOM (armed=0/1 + probe/scan/lowmem) · اختبار حي لـ `POST /inject` (رفض
جسم غير-كائن) · أعراض المنافذ متناسقة (50000/8080).

---

## 🚀 v1.0.0 — الإطلاق الأولي

- بناء `deepslop` من `slopkit-webkit-exploit-main` + أجزاء من `slopkit2`
  (rop-worker / lapse-runtime).
- واجهة Dashboard جديدة (RUN / PROBE / LOW_MEM / BEACON / sysinfo / scaninfo /
  meminfo) مع اكتشاف تلقائي لـ FW من UA.
- وضع PROBE: تشغيل السلسلة حتى R/W + تسريب القواعد + فحص الأوفستس ثم التوقف
  (لا commit، لا notification).
- ماسح أوفستس ذاتي (self-porting): `scanWindowFor` / `readTrampolineBytes` /
  `scanAndVerifyOffsets` داخل `loadHistoryCritical` مع إعادة توجيه `rwView`.
- وضع LOW_MEM: carrier 4.5M + drain 128 + تخطي slab 4MB + تصعيد OOM تلقائي
  (`escalateLowMem`).
- منارات BEACON عبر XHR متزامن (`/log/<msg>`).
- REPL محسّن: أوامر `offsets` / `scan` / `resolve` / `mem` / `notify` / `fire`.
- `offsets.json` بجدول 23 FW + `lapse-offsets.json`.
- استبعاد ملفات kernel عن قصد (netctrl / lapse / elfldr / kexp).
