# دليل استضافة DeepSlop محليا

هذا الدليل يشرح تشغيل DeepSlop من الكمبيوتر ثم فتحه من متصفح PS5 على نفس
الشبكة. النسخة النشطة مخصصة لـ FW 13.60 userland فقط. الملفات القديمة داخل
`archive/` مرجعية ولا يتم تحميلها من الصفحة النشطة.

## المتطلبات

- جهاز PS5 تملكه أو تملك تصريحا لاختباره.
- FW مطابق تماما لـ `13.60`.
- كمبيوتر وPS5 على نفس شبكة Wi-Fi أو Ethernet.
- Python 3 مثبت على الكمبيوتر.
- عنوان IP معروف للكمبيوتر. العنوان المستخدم في الإعداد الحالي هو
  `192.168.8.47`.
- السماح للمنفذ TCP `8000` في جدار الحماية.

إذا تغير عنوان IP، استخدم العنوان الجديد في كل خطوات هذا الدليل وفي حقل
`PC receiver`. لا تفترض أن `192.168.8.47` صحيح بعد تغيير الشبكة.

## تشغيل الخادم

افتح Terminal أو PowerShell داخل جذر المشروع:

```bash
cd /path/to/deepslop
python3 tools/sprx_dump_receiver.py --bind 0.0.0.0 --port 8000
```

على Windows يمكن استخدام:

```powershell
py -3 tools/sprx_dump_receiver.py --bind 0.0.0.0 --port 8000
```

يجب أن تظهر رسائل مشابهة:

```text
DeepSlop: http://192.168.8.47:8000/
Dump output: .../deepslop/dumps
```

اترك نافذة الخادم مفتوحة طوال الاختبار. لا تغلقها أثناء `CHECK` أو `DUMP`.

## اختبار الاتصال

من الكمبيوتر نفذ:

```bash
curl http://127.0.0.1:8000/__deepslop/dump/ping
```

النتيجة الصحيحة تحتوي على `ok:true` وقيود receiver:

```json
{"ok":true,"maxChunk":2048,"maxModule":8388608}
```

بعد ذلك افتح من PS5:

```text
http://192.168.8.47:8000/
```

إذا لم تفتح الصفحة، افحص عنوان IP، اتصال الشبكة، جدار الحماية، وعزل شبكة
Guest أو VPN قبل تشغيل RCE.

## تشغيل RCE

1. افتح الصفحة من الخادم المحلي، وليس نسخة قديمة من cache.
2. انتظر ظهور `FW 13.60 offsets ready`.
3. اضغط `RUN USERLAND RCE` مرة واحدة.
4. راقب مربع `RUNTIME DIAGNOSTICS`.
5. انتظر الحالة `RCE ACTIVE`.

زر `13.60 PREFLIGHT` مخصص لفحص offsets ثم التوقف قبل تفعيل RCE الكامل. لا
تستخدمه إذا أردت تشغيل payloads أو التفريغ.

الإعداد الحالي ثابت ومنخفض لتقليل OOM:

- Carrier بحجم 4.5M slots.
- Drain بحجم 128 buffer.
- محاولة واحدة فقط.
- إعادة المحاولة التلقائية معطلة.

إذا حدث OOM، لا تضغط الزر عدة مرات. أعد تحميل الصفحة واقرأ آخر مرحلة ظاهرة.

## فهم الحالات

- `OFFSETS READY`: جدول FW جاهز، ولم يبدأ RCE.
- `PROBE RUNNING`: فحص offsets يعمل فقط.
- `PROBE COMPLETE`: الفحص انتهى، لكن RCE غير مفعل.
- `RCE RUNNING`: مرحلة الذاكرة تعمل حاليا.
- `RCE ACTIVE`: RCE الكامل و`aimRead` جاهزان للتشخيص.
- `RCE REQUIRED`: يجب تشغيل RCE الكامل قبل payload.
- `RCE FAILED`: توقفت المرحلة مع سبب ظاهر في السجل.
- `loader required`: RCE جاهز، لكن metadata الخاصة بالموديول غير متوفرة.
- `not verified`: الموديول مرشح فقط وقاعدته غير موثقة.

## السجل والأزرار

مربع `RUNTIME DIAGNOSTICS` يعرض آخر مراحل التشغيل. يتم حفظ جزء صغير من السجل
وآخر stage في جلسة المتصفح حتى يظهر بعد إعادة التحميل.

- زر `CLEAR` بجانب `RUNTIME DIAGNOSTICS` يمسح السجل المحفوظ والظاهر.
- زر `CLEAR` بجانب `PAYLOAD OUTPUT` يمسح نتيجة payload الحالية.
- إذا مات renderer بالكامل فلن تستطيع الصفحة تسجيل ما حدث بعد لحظة الموت، لكن
  آخر stage محفوظ قبل الانهيار سيظهر بعد إعادة التحميل.

## Hardware A/B diagnosis

Use a fresh page for every case. Do not press `RUN USERLAND RCE` twice and do
not add `carrier`, `n`, or `auto` URL overrides.

1. Run RCE only. Record the last `RUNTIME DIAGNOSTICS` stage.
2. On a fresh page, run RCE then `Primitive Preflight` only.
3. On a fresh page, run RCE then `CHECK` for one unlocked module.
4. On a fresh page, run RCE, `CHECK`, then one LOW-speed `DUMP`.
5. Save the browser `Previous stage` and receiver requests after each case.

Interpret the first failing case, not the final page state:

- Before `ADDROF-COPY`: carrier or capture allocation pressure.
- During `SSV-GROOM`: drain, slab, or hole peak pressure.
- After `RCE ACTIVE`: payload or retained primitive state pressure.
- During `DUMP`: repeated-read, chunk, or receiver pressure.

Do not compare a successful Poop2JB run as a FW 13.60 baseline. Its archived
worker and allocation geometry target different firmware/runtime assumptions.

## تشغيل payloads

بعد ظهور `RCE ACTIVE` شغل payload واحدا في كل مرة بهذا الترتيب:

1. `Primitive Preflight`.
2. `Memory Integrity`.
3. `Userland Report`.
4. `ELF Module Map`.
5. `Worker Preflight`.
6. `Resizable ArrayBuffer Probe`.

انتظر `PAYLOAD COMPLETE` أو `PAYLOAD FAILED` قبل تشغيل payload آخر. الصفحة
تمنع التشغيل المتزامن حتى لا تتنافس payloads على `payloadResult` أو على حالة
الذاكرة.

## فحص SPRX قبل التفريغ

استخدم `CHECK` أولا، ولا تضغط `DUMP` مباشرة. فحص `CHECK` لا يرسل ملفا إلى
الكمبيوتر، بل يقوم بالتالي:

- يتحقق من FW `13.60`.
- يتحقق من وجود `aimRead`.
- يتحقق من metadata موثقة للموديول.
- يتحقق من ELF64 little-endian.
- يتحقق من program headers و`PT_LOAD`.
- يقرأ كل bytes الخاصة بـ `pFilesz` بقطع صغيرة ثم يرمي كل قطعة.
- يختبر receiver عبر `/ping`.

إذا ظهرت `PREFLIGHT PASS` يصبح مسار القراءة الكامل جاهزا للتفريغ.

## تشغيل DUMP

1. اختر موديولا غير مقفل.
2. اضغط `CHECK` وانتظر `PREFLIGHT PASS`.
3. ابدأ بسرعة `LOW` في أول تجربة.
4. راقب progress bar وعدد bytes وETA.
5. لا تغلق الخادم ولا تعيد تحميل الصفحة أثناء التفريغ.
6. انتظر `SPRX DUMP COMPLETE`.

الأهداف ذات القاعدة runtime الموثقة حاليا:

- `libkernel_web.sprx`.
- `libSceNKWebKit.sprx`.

يبقى `libkernel.sprx` مقفلا حتى يتم التحقق من قاعدته الفعلية. مكتبات parser
وstorage تبقى مقفلة إذا لم يوفر registry قيمة `base` و`loadBias` و
`programHeaderAddress`. لا يتم تخمين العناوين.

التفريغ يشمل bytes file-backed الخاصة بـ `pFilesz`. لا يضيف مساحات BSS أو
المساحات runtime-only التي يمثلها `pMemsz`.

## الملفات الناتجة

يكتب receiver داخل:

```text
dumps/<dump-id>/<module>/
```

بعد النجاح يجب أن تجد:

- `manifest.json` مع firmware وsegments وSHA-256.
- `file-image.sprx` مرتبا حسب `pOffset`.
- `segment-<index>.memory.bin` لكل segment.

لا تعتمد على حجم الملف وحده. افحص `manifest.json` وحالة كل segment وSHA-256.

## حل المشاكل

### ظهور `RCE REQUIRED`

لم يكتمل RCE الكامل، أو تم استخدام وضع probe، أو أعيد تحميل الصفحة. اضغط
`RUN USERLAND RCE` وانتظر `RCE ACTIVE`.

### ظهور `loader required`

RCE يعمل، لكن لا توجد metadata موثقة للموديول. هذا ليس خطأ في خادم الكمبيوتر.

### ظهور `not verified`

الموديول مرشح بحث فقط ولا توجد قاعدة runtime موثقة، لذلك يبقى مقفلا.

### حدوث OOM أو crash

1. أعد تحميل الصفحة.
2. اقرأ `Previous stage` في سجل التشخيص.
3. لا تضغط أزرار RCE عدة مرات.
4. تأكد من أنك تستخدم النسخة الحديثة من GitHub أو الخادم المحلي.
5. لا تستخدم URL قديم يحتوي على `carrier` أو `n`.
6. أوقف الاختبار إذا تكرر OOM.

### عدم ظهور output

تأكد من `RCE ACTIVE`، ثم اضغط `CLEAR` وشغل payload واحدا. إذا لم يظهر stage،
أعد التحميل واقرأ `Previous stage`.

### توقف ETA أو عدم وصول ACK

راقب طرفية Python. يجب أن ترى طلبات `ping` و`start` و`chunk`. افحص جدار
الحماية، ثم أوقف العملية إذا توقف الكمبيوتر عن الرد.

### عدم الوصول إلى الكمبيوتر

تأكد من:

- أن PS5 والكمبيوتر على نفس الشبكة.
- أن عنوان الكمبيوتر لم يتغير.
- أن الخادم مربوط على `0.0.0.0` وليس `127.0.0.1` فقط.
- أن TCP port `8000` مسموح في firewall.
- أن VPN أو Guest Wi-Fi لا يعزل الأجهزة.

## اختبارات الكمبيوتر

من جذر المشروع نفذ:

```bash
node tests/active-contract.test.js
node tests/resizable_arraybuffer_probe.test.js
node tests/sprx_dump_preflight.test.js
python3 tests/sprx_dump_contract.test.py
node tools/scan-test.js
```

هذه اختبارات عقود وحدود وreceiver. لا تستبدل اختبار PS5 حقيقيا. اعتبر التفريغ
جاهزا فقط بعد نجاح `CHECK` ثم اكتمال تفريغ صغير مع manifest وSHA-256 صحيحين.

## نطاق الأمان

- استخدم المشروع على جهاز تملكه أو لديك تصريح لاختباره.
- الصفحة النشطة FW `13.60` userland فقط.
- التحميل البعيد لـ JavaScript معطل.
- payloads القديمة ومراحل kernel داخل `archive/` ولا يتم تحميلها.
- لا تستخدم offsets من firmware آخر.
- لا تحذف ملفات `.part` أثناء تفريغ نشط.
