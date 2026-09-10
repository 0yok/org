# CyberYoNko — دليل النشر

هذا المشروع مكوّن من جزئين:
- **`public/`** — الموقع (الصفحة التسويقية + التطبيق) — يترفع على GitHub Pages
- **`functions/`** + **Firestore** — السيرفر والحسابات والمفاتيح — يترفع على Firebase (مجاني للحجم اللي رح تبدأ فيه)

اتبع الخطوات بالترتيب.

---

## 1) إنشاء مشروع Firebase

1. روح لـ https://console.firebase.google.com وسوي مشروع جديد
2. من داخل المشروع: **Build > Firestore Database > Create database** — اختر "Start in production mode"
3. من داخل المشروع: **Build > Authentication > Sign-in method** — فعّل **Email/Password**
4. من **Project settings > General > Your apps** — ضيف "Web app" جديد، وانسخ كائن `firebaseConfig` اللي بيطلعلك

---

## 2) تعبئة إعدادات العميل

افتح `public/assets/firebase-init.js` وحط القيم اللي نسختها بالخطوة السابقة بدل `PASTE_...`.
هذي القيم عمومية (مو سرية) — عادي تترفع على GitHub.

---

## 3) تثبيت أدوات Firebase وربط المشروع

```bash
npm install -g firebase-tools
firebase login
cd cyberyonko-v2
firebase use --add     # اختر مشروعك اللي سويته بالخطوة 1
```

---

## 4) إضافة مفتاح Gemini كـ Secret (مو بالكود)

سوي مفتاح Gemini API من https://aistudio.google.com (مجاني بحدود يومية)، وبعدين:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

بيطلب منك تلصق المفتاح — يتخزن مشفّر عند Google، وما يظهر أبداً بأي ملف بالمشروع.

> **مهم:** إذا كان عندك مفتاح لصقته سابقًا بأي شات أو مكان غير آمن، روح لـ aistudio.google.com واعمل له **Delete** وسوي وحدة جديدة قبل ما تحطها هون.

---

## 5) نشر الـ Cloud Functions وقواعد Firestore

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules
```

---

## 6) زرع الـ 300 مفتاح بقاعدة البيانات

1. من **Project settings > Service accounts > Generate new private key**
2. حط الملف اللي نزل باسم `scripts/serviceAccountKey.json` (هذا الملف بالـ `.gitignore` أصلاً — لا ترفعه لـ GitHub أبداً)
3. شغّل:

```bash
cd scripts
npm install firebase-admin
node seed_keys.js
```

بيطلعلك "Done. All keys seeded as unused." — يعني الـ 300 مفتاح جاهزين بقاعدة البيانات.
ملف `scripts/keys_300.txt` هو نفس القائمة نصياً — احتفظ فيه عندك (مو على GitHub) عشان توزع مفتاح لكل زبون.

---

## 7) رفع الموقع على GitHub Pages

```bash
git init
git add .
git commit -m "CyberYoNko launch"
git remote add origin <رابط الريبو حقك>
git push -u origin main
```

من إعدادات الريبو بـ GitHub: **Settings > Pages > Source** اختر الفرع `main` والمجلد `/public`.

---

## ملاحظات أمان مهمة

- **لا ترفع أبداً**: `scripts/serviceAccountKey.json`، أو أي ملف فيه مفتاح Gemini الفعلي. الملفين مو موجودين أصلاً بالمشروع كنص واضح — بس تأكد دايمًا قبل أي `git push`.
- كل تعديل على `messagesUsed` أو `unlocked` يصير **فقط** من داخل Cloud Functions (Admin SDK) — قواعد Firestore بـ `firestore.rules` تمنع أي تعديل مباشر من المتصفح، فحتى لو حد فتح Developer Tools وحاول يلعب بالكود، ما رح يقدر يزوّر رصيده أو يعيد استخدام مفتاح.
- المفتاح الوحيد اللي بالكود (`firebase-init.js`) هو إعداد Firebase العمومي — مصمم من الأساس ليكون عام وموجود بأي موقع Firebase، مش سري.

---

## هيكل الملفات

```
cyberyonko-v2/
├── public/                 → يترفع على GitHub Pages
│   ├── index.html          → الصفحة التسويقية
│   ├── app.html            → تسجيل الدخول + الشات
│   └── assets/
│       ├── style.css
│       ├── firebase-init.js   → عبّي إعداداتك هون
│       └── app.js
├── functions/               → يترفع على Firebase
│   ├── index.js             → chat + redeemKey
│   └── package.json
├── scripts/
│   ├── seed_keys.js          → شغّله مرة وحدة
│   └── keys_300.txt          → قائمة المفاتيح (خصوصية، مو للرفع)
├── firestore.rules
├── firebase.json
└── .gitignore
```
