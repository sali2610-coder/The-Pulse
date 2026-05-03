# iOS Shortcut — חיבור CAL ו־MAX לאוטומציה

מדריך זה מסביר איך לחבר את אפליקציית **Shortcuts** באייפון לאתר Sally כך
שכל SMS חיוב מ־CAL או מ־MAX (כולל חיובי Apple Pay) ייכנס אוטומטית לדאשבורד.

> **חד-פעמי:** הגדרה אחת לכרטיסי כאל, הגדרה אחת ל־max. אחרי זה רץ לבד.

---

## דרישות מקדימות

לפני שמתחילים — ודא שיש לך:

1. **iPhone עם iOS 16+** (Shortcuts מותקן כברירת מחדל).
2. **`Device ID` ו־`Webhook URL`** — מהטאב "הגדרות" ב־Sally → כרטיס "חיבור ה־iPhone". יש כפתור העתקה לכל שדה.
3. **`WEBHOOK_SECRET`** — סיסמה שהגדרת ב־Vercel (משתנה סביבה). זה ה־Bearer token. זה ערך פרטי שלך ושל ה־iPhone שלך בלבד.
4. **SMS מהבנק / חברת האשראי** — ודא שאתה אכן מקבל SMS על חיובים. אם לא, צור קשר עם המנפיק והפעל "התראת SMS על כל חיוב".

---

## חלק א' — בדיקה ידנית של ה־endpoint

לפני שיוצרים אוטומציה, נוודא שהשרת מקבל ומפענח SMS דמה.

ב־Mac/iPhone (Terminal או iSH על iPhone):

```sh
curl -X POST "https://YOUR-DOMAIN/api/webhooks/transactions" \
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
  -H "x-sally-device: YOUR_DEVICE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "issuer": "cal",
    "smsBody": "לקוח יקר, בוצעה עסקה בכרטיסך המסתיימת ב-1234 בבית עסק '\''שופרסל'\'' בסכום 12.50 ש\"ח בתאריך 03/05/26."
  }'
```

תגובה צפויה:

```json
{ "ok": true, "persisted": true, "duplicate": false, "externalId": "..." }
```

פתח את ה־PWA — אחרי כמה שניות (focus → poll), אמור להופיע חיוב 12.50 ₪ בקטגוריית "אוכל" ב־Pulse.

אם קיבלת `kv_not_configured` → אתה צריך להגדיר את ה־Vercel KV (Upstash). ראה `CLAUDE.md → Environment`.

אם קיבלת `invalid_token` → ה־`Authorization: Bearer ...` לא תואם ל־`WEBHOOK_SECRET`.

---

## חלק ב' — בניית ה־Shortcut ל־CAL

1. פתח את אפליקציית **Shortcuts** באייפון.
2. עבור לטאב **Automation** (התחתון).
3. הקש **+** → **Create Personal Automation** → **Message**.
4. בשדה **Sender**: הקש **Choose**, חפש את "כאל" / "CAL" (תלוי איך הם מוגדרים אצלך באנשי קשר/הודעות). בחר **את כל הערוצים שמהם הם שולחים** (לפעמים מספר אחד למסרונים, אחר ל־OTP).
5. השאר **Message Contains** ריק (כל הודעה מהשולח תפעיל).
6. הקש **Next**.
7. הקש **Add Action** → חפש **Get Contents of URL** → הוסף.
8. הרחב את ה־action (חץ למטה).
9. הגדר את השדות:

   - **URL:** `https://YOUR-DOMAIN/api/webhooks/transactions`
   - **Method:** `POST`
   - **Headers:** הקש **Add new header** ולהוסיף שלוש שורות:
     - `Authorization` → `Bearer YOUR_WEBHOOK_SECRET`
     - `x-sally-device` → `YOUR_DEVICE_ID`
     - `Content-Type` → `application/json`
   - **Request Body:** בחר **JSON**. הוסף שני שדות:
     - `issuer` → text → `cal`
     - `smsBody` → text → הקש על השדה ובחר את המשתנה **Shortcut Input** (הופעל אוטומטית מההודעה הנכנסת).

10. הקש **Next**.
11. **חשוב:** כבה את **Ask Before Running** (אחרת תקבל אישור ידני בכל SMS) ואת **Notify When Run** אם אתה רוצה שזה ירוץ בשקט.
12. **Done**.

---

## חלק ג' — בניית ה־Shortcut ל־MAX

חזור על שלב ב' עם שני שינויים בלבד:

- **Sender** ב־Step 4: בחר את "max" / "MAX" / "מקס" — מה שמופיע בהודעות ה־SMS שלך.
- **`issuer`** ב־Step 9: שנה ל־`max`.

---

## חלק ד' — אימות end-to-end

1. בצע רכישה קטנה באחד מהכרטיסים (קפה, חניה).
2. ה־iPhone מקבל SMS תוך שניות.
3. ה־Shortcut רץ אוטומטית, שולח POST ל־`/api/webhooks/transactions`.
4. השרת מפענח, שומר ב־KV.
5. כשתפתח את אפליקציית Sally (או מתי שהיא עוברת ל־visible), ה־AutoSync מושך את העסקה החדשה. ה־Pulse מתנפח.

---

## אבחון בעיות נפוצות

| תופעה | סיבה אפשרית | פתרון |
|---|---|---|
| `invalid_token` | ה־Bearer ב־header לא תואם ל־`WEBHOOK_SECRET` ב־Vercel | בדוק את ה־env ב־Vercel, רענן את ה־Shortcut |
| `invalid_device` | `x-sally-device` חסר או מכיל תווים לא חוקיים | העתק שוב מהטאב "הגדרות" |
| `kv_not_configured` | אין Upstash KV מחובר ב־Vercel | התקן את אינטגרציית Upstash מ־Marketplace, עשה redeploy |
| `incomplete_cal_sms` / `incomplete_max_sms` | ה־SMS שונה מהפורמט שצפינו | שלח לי דוגמה וניצור regex משלים |
| ה־PWA לא מתעדכנת | ה־AutoSync רץ רק כש־visible. סגור ופתח את הלשונית | בדוק ב־Settings → "סנכרון אחרון" |

---

## אבטחה

- ה־`WEBHOOK_SECRET` הוא הסוד היחיד שמגן על ה־endpoint. **אל תשתף אותו**.
- ה־`Device ID` שלך זה ה־key שמתחתיו נשמרות העסקאות ב־KV. מי שמחזיק בו יכול לקרוא את העסקאות שלך דרך `/api/transactions/sync`. לכן יוצר ב־localStorage ב־iPhone שלך כ־UUID 128-bit, מספיק חזק לפרויקט אישי.
- כל התעבורה ב־HTTPS. iOS Shortcut לא תומך ב־HTTP.
- כשתרצה להוסיף משתמשים נוספים — להפעיל את Clerk (כבר מותקן feature-flagged ב־`src/lib/auth-config.ts`).

---

## שדרוגים אפשריים בעתיד

- **התראות פוש** ל־PWA כשעסקה חדשה נכנסת (Web Push API + service worker).
- **Stream Server-Sent Events** במקום polling — צריכת סוללה נמוכה יותר.
- **תמיכה במנפיקים נוספים** (ישראכרט, אמריקן אקספרס): להוסיף `src/lib/parsers/<issuer>.ts` ולהוסיף לדיספאצ'ר ב־`src/lib/parsers/index.ts`.
