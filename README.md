# DEEPSLOP — PS5 WebKit Exploit Kit (13.60 / WebKit RCE)

كيت استغلال متصفح WebKit لجهاز PS5 (مشروع بحثي على جهاز خاص بالمستخدم)، مبني على
`slopkit-webkit-exploit-main` مع ترقيات: واجهة تحكم جديدة، وضع PROBE (تحقق من
الأوفستس دون commit)، ماسح أوفستس ذاتي (self-porting offset scanner)، وضع ذاكرة
منخفضة LOW_MEM، ومنارات BEACON لمراقبة فشل/نجاح كل مرحلة.

> **نطاق الدعم**: نافذة WebKit RCE تنتهي عند FW 13.60 — على 13.60 يوجد **RCE فقط**
> (لا جيلبريك كامل؛ نواة الـ kernel تدعم حتى 12.00 = netctrl / 10.01 = lapse).
> ملفات kernel (`lapse-runtime.js`, `rop-worker.js`, `aioshellcode.js`) منقولة
> من slopkit2 للرجوع إليها فقط وهي **غير موصولة** بالمسار الرئيسي.

---

## الملفات

```
deepslop/
├── index.html            Dashboard (RUN / PROBE / LOW_MEM / BEACON / sysinfo)
├── exploit.js            سلسلة الاستغلال الكاملة (WebKit RCE + ROP + ماسح الأوفستس)
├── remote.js             WebSocket loader (REPL — يُحقن بعد RCE)
├── ws_server.py          خادم REPL + POST /inject (منفذ 50000) + منارة ROP
├── send_payload.py       يرسل payload إلى الخادم (--host/--port)
├── payloads/             helloworld.js · notification.js · deepslop_info.js
├── offsets/              offsets.json (23 FW) · lapse-offsets.json (9.00–10.01)
├── rop-worker.js         staging ROP عبر worker + setjmp/longjmp (10.00 — غير موصول)
├── rop_slave.js          worker المرافق
├── lapse-runtime.js      runtime lapse (9.00–10.01 — غير موصول، محروس FW)
├── aioshellcode.js       محمّل AIO الأصلي (inert — غير موصول)
└── cat.jpg               أصل غير مستخدم (مرجعي)
```

## الإعداد المطلوب (نقاط مفتاحية)

1. **IP جهازك**: عدّل `RCE_PC_IP` في `exploit.js:120` (fallback في `remote.js:16`).
2. **المنافذ** (متناسقة في كل مكان):
   - `50000` — `ws_server.py` (REPL + `POST /inject`)
   - `8080` — خادم HTTP ثابت يخدم `index.html` و`remote.js` و`offsets/`
     (مثال: `python3 -m http.server 8080 --directory deepslop`).
     **مهم**: `exploit.js` يجلب `remote.js` من `http://<IP>:8080/remote.js` —
     بدون خادم 8080 لا يصل REPL.
3. ضع `index.html` في رابط الاستغلال (مثل `http://<PC>:8080/?go=1` أو املأ
   `?fw=13.60` للتحكم اليدوي). `?go=1` يبدأ التشغيل تلقائيًا **بعد** تحميل
   الأوفستس (أُصلح سباق الجلب).

## الاستخدام

```
# الطرفية 1 — الخادم
python3 ws_server.py

# الطرفية 2 — إرسال payload (بعد اتصال PS5)
python3 send_payload.py payloads/helloworld.js
python3 send_payload.py payloads/helloworld.js --host 192.168.1.50
```

أوامر REPL في `ws_server.py`:
`send <fichier.js>` · `offsets`/`scan` · `resolve <addr>` · `mem <addr> [n]` ·
`notify <texte>` · `fire` (يشغّل `commitRce()`) · كود JS مباشر.

أوضاع الواجهة (`index.html`): **RUN** (السلسلة الكاملة) · **PROBE**
(يتوقف بعد R/W + تسريب القواعد + فحص الأوفستس — لا notification) · **LOW_MEM**
(carrier 4.5M، drain 128، بدون slab 4MB، تصعيد OOM تلقائي) · **BEACON**
(XHR متزامن إلى `/log/<msg>` — عمدًا، ليقبل قبل أي navigation).

## ميزانية الذاكرة (WebKit)

| عنصر | عادي | LOW_MEM |
|---|---|---|
| carrier (float64) | 9,000,000 خانة ≈ 72MB | 4,500,000 ≈ 36MB |
| سلسلة الأسر (captured string) | ≈ 144MB | ≈ 72MB |
| drain (keep-alive) | 512 × 64KB | 128 × 64KB |
| slab 4MB | نعم | لا |

## سجل التغييرات (Changelog)

### v1.0.1 — مراجعة كاملة + إصلاحات (هذه الجلسة)
فحص كل ملف سطرًا بسطر (دوال الاستغلال، الواجهة، الخادم، payloads، الأوفستس)
وتثبيت مهارات البحث: `webkit-jsc-exploit-research` (مخصصة) +
`performing-binary-exploitation-analysis` + `performing-fuzzing-with-aflplusplus`.

**أخطاء أُصلحت — `exploit.js`:**
- **HIGH** `carrierSlots` غير معرَّف (ReferenceError مُبتلَع) في `exposeDeepslopGlobals`
  و`deepslopMemEstimate` — كان يمنع `window.deepslopInfo` بالكامل → أُصلح إلى `CARRIER_SLOTS`.
- **MED** `readTrampolineBytes` كان يقرأ 10 بايت ويقارنها بسلسلة 17 بايت —
  يعرض "(mismatch)" دائمًا → الحلقة الآن `i < 17`.
- **LOW** `navigator.userAgent` غير محروس عند الإقلاع (يفسد كل شيء في Node).
- **LOW** `requestAnimationFrame` خارج try/catch → حارس + بديل `setTimeout`.
- **LOW** فحص GOT "read-twice" كان يقرأ من نفس التوجيه (صحيح دائمًا) →
  `aimCarrier` يعاد قبل كل قراءة ثانية.

**تحسينات — `exploit.js`:**
- `deepslopScan` يُصفَّر في `resetAttemptState` (لا فحص قديم بين المحاولات).
- تنظيف كامل لذاكرة probe (`capturedString/capturedWords/keepAlive/...`).
- `initKernel()` و`sendNotifNatural()` داخل try/catch مع `mark` بدل الفشل الصامت.
- `window.commitRce` أصبح مكشوفًا (عقد REPL موثوق بدل الاعتماد على eval المباشر).
- نهاية نافذة الفحص `endRva` مشبوكة بـ `WEBKIT_RELRO_END` (لا قراءة خارج RELRO).
- `fetch` بلا `cache:"no-store"` (غير موثوق على WebKit القديم) → cache-busting
  بـ `?v=REVISION` في الـ URL.
- إزالة سجل `RW-HEADER-HEX` المكرر؛ شعار `offline-verified-fw` أصبح ديناميكيًا
  من `FW_LABEL`.

**أخطاء أُصلحت — `index.html`:**
- **HIGH** سباق `?go=1`: كان التشغيل التلقائي يسبق جلب الأوفستس (تسرب أوفستس 11.60
  افتراضية لأي FW) → `autoRunNow()` يُستدعى بعد انتهاء الجلب في كل المسارات.
- **MED** زرا RUN/PROBE يبقيان معطلين بعد النجاح → يُعاد تفعيلهما في `ok`.
- **MED-LOW** فرع "auto-retry" الميت (يُقيَّم بعد التعيين دائمًا) → فحص قبل التعيين
  برسالة صادقة "reload the page to run again".
- **LOW** رفض `navigator.clipboard` غير مُلتقَط → `.then/.catch` + فحص الوجود.
- إضافة العناصر المخفية `#cap`/`#cat`/`#scr` (كانت `setCaption/catState/screenLine`
  تفشل بصمت على الصفحة الحقيقية) + favicon (`data:,`).

**إصلاحات — الخادم/العميل:**
- `ws_server.py`: مراقب انقطاع (watcher) يعمل حتى عندما يكون REPL محجوبًا في
  `input()`؛ رفض PS5 ثانية برسالة close؛ معالجة `ready` المتأخر؛ استهلاك منارة
  ROP (`PS5_RCE_OK` بدل إغلاق صامت)؛ تحقق `isinstance(msg, dict)` في `/inject`؛
  توثيق خادم 8080 في الرأس.
- `remote.js`: `resolve`/`mem` يرسلان `status:"error"` عند الفشل الحقيقي (كان
  "ok" زائفًا)؛ حذف متغير `kb` الميت.
- `send_payload.py`: خيارات `--host`/`--port` (+ متغير بيئة `PS5_SERVER`).
- `payloads/deepslop_info.js`: `?? "none"` بدل سلسلة `"undefined"`.
- **حُرّاس FW** في ملفات kernel: `lapse-runtime.js` يرفض أي FW خارج 9.00–10.01
  برسالة نظيفة؛ `rop-worker.js` يرفض أي FW غير 10.00 قبل أي قراءة من الخيط
  القاتل (walk قبل self-checks كان يقرأ عنوانًا غير معيّن)؛ ثابت
  `LK_SYSCALL_WRAPPER` باسمه + تعليق توثيقي للخلاف مع lapse-offsets.
- `rop-worker.js`: تعطيل `W.batchBuf` عند `allocReset()` (فساد صامت للسلسلة)؛
  حارس `W.worker` في `ping()` + `worker.onerror`؛ مهلة جدار زمنية 10s لـ fireSync.
- `aioshellcode.js`: عنوان بارز يوضح أنه كود قديم غير موصول بمراجع مفقودة.
- حذف `__pycache__/` + إضافة `.gitignore`.

**التحقق:** `node --check` على كل ملفات JS · `py_compile` · صلاحية JSON ·
اختبارات تحميل بمحاكاة DOM (armed=0/1 + probe/scan/lowmem) · اختبار حي لـ
`POST /inject` (رفض جسم غير-كائن) · أعراض المنافذ متناسقة (50000/8080).

## المشاكل المعروفة / نقاط مفتوحة

- **خلاف بيانات RE لـ 10.00**: `rop-worker.js` (setjmp/longjmp/syscall_wrapper)
  يختلف عن `lapse-offsets.json` بفارق ثابت 0x260 — يجب المصالحة على الثنائيات
  الحقيقية قبل أي اعتماد.
- `lapse-runtime.js`: استدعاءات `mmap` بدون وسيط `pos` (r9 غير معرَّف — "coin
  flip") في مسار slab وjitshm؛ `read_buffer` يفسر قيمة إرجاع `getsockopt` خطأً
  (FreeBSD يُرجع 0 عند النجاح) ولا يقرأ optlen؛ احتكاك `get_bytecode_addr`
  بمكدس malloc. هذه مسارات kernel غير موصولة — إصلاحها يتطلب RE للمكتبة.
- `MAX_ATTEMPTS` يُفرض على المسارات الآمنة فقط (المسار العنيد غير محكوم) —
  مقصود من الكيت الأصلي.
- المنارة (BEACON) تستخدم XHR متزامن عمدًا (كي يُرسل قبل navigation) — يجمّد
  مؤشر الرسم لحظيًا.
- لا يوجد مصادقة على `0.0.0.0:50000` — أي جهاز على الشبكة يستطيع قيادة REPL
  (مقبول لكيت محلي؛ لا تعرّضه للإنترنت).

## الأمان والحدود

- للاستخدام البحثي على أجهزة تملكها فقط. الكيت يعدّل ذاكرة عملية المتصفح وقد
  يسبب أعطالًا — اختبر في بيئة معزولة.
- استبعاد ملفات kernel عن قصد: `netctrl/lapse/elfldr/kexp` (معطَّلة أو خارج
  نطاق 13.60) — راجع الكيتات الأصلية في `../slopkit2` إذا احتجت إليها.

## المصادر

- `slopkit-main`, `slopkit-webkit-exploit-main`, `slopkit2` — الكيتات الأصلية.
- `https://github.com/WebKit/WebKit` — مرجع دراسة JSC (تتبع الرقع الأمنية).
