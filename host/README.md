# host/ — أدوات استضافة إيصال الحمولة (من مستودعات قديمة، منقاة)

## الملفات

| ملف | المصدر | الوظيفة |
|---|---|---|
| `fakedns.py` | PS5-UMTX-Jailbreak (2020) | خادم DNS MITM بنظام regex — يحوّل `manuals.playstation.net` إلى IP جهازك |
| `dns.conf` | نفسه | القواعد: `^(.*\.)*(manuals\.playstation\.net|.*\.sonyentertainmentnetwork\.com)$` → جهازك |
| `host.py` | نفسه | خادم HTTPS (port 443) بجدول hosts → يقدّم `cache.appcache` + الحمولة |
| `localhost.pem` | نفسه | شهادة self-signed لـ HTTPS (الـ PS5 يقبلها للـ appcache بدون تحذير) |
| `appcache_manifest_generator.py` | zecoxao.github.io | يولد `cache.appcache` من مجلد |
| `log_server.py` | Y2JB | خادم HTTP :8080 يستقبل سجلات (log write-back channel مع CORS) |
| `dumpserver.py` | PS5-UMTX-Jailbreak | استقبال تفريغ ذاكرة النواة عند توفرها |

## طريقة الاستخدام (فقط لبدء التصفح نحو manual.playstation.net)

1. PS5: DNS يدوي → IP جهازك.
2. `python3 host.py` (HTTPS على 443) — عادة يطلب `sudo` على Linux.
3. `python3 fakedns.py -i eth0` أو اربط fakedns على port 53 (تشغيل بصلاحيات).
4. صفر `dns.conf` إلى `manuals.playstation.net` فقط في الوضع الحقيقي.
5. ملف `cache.appcache` لا بد أن يُقدَّم بالمسار `.../cache.appcache` عبر HTTPS وأن
   يستهدف آلة المسار الذاتي — حُدد السلوك التجريبي على هذه الحقيقة.
6. `appcache_manifest_generator.py <dir>` يبني القائمة تلقائيًا (CACHE/NETWORK).

تحذيرات: هذه الأدوات قديمة (2020) ومصلحة للعمل على Python 3؛ لا تشغّلها على شبكة غير
شبكتك، وهي للاختبار الأمني فقط.
