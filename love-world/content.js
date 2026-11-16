/*
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  LOVE WORLD — SHAXSIY MATNLAR FAYLI                          ║
 * ║  Saytdagi barcha ism, matn, savol va xotiralar shu yerda.    ║
 * ║  Faqat qo‘shtirnoq ("...") ichidagi matnlarni o‘zgartiring.  ║
 * ║  Qulayroq yo‘l: editor.html sahifasini oching.               ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Matnlarda {herName} va {myName} yozsangiz, ular avtomatik
 * ravishda quyidagi ismlar bilan almashtiriladi.
 */
window.LOVE_CONTENT = {
  // ── Asosiy ma’lumotlar ───────────────────────────────────────
  herName: "Sayyora",                // Sayt kim uchun (uning ismi)
  myName: "Sardor",                  // Sizning ismingiz (imzo uchun)
  startDate: "2024-02-14T18:30",     // Birga bo‘lgan kuningiz: YYYY-MM-DDTHH:MM
  siteTitle: "LOVE WORLD",
  entranceSubtitle: "Faqat {herName} uchun yaratilgan sehrli olam",

  // ── Musiqa (ixtiyoriy) ───────────────────────────────────────
  // O‘z qo‘shig‘ingizni music/ papkasiga qo‘ying va nomini yozing,
  // masalan: "music/bizning-qoshiq.mp3". Bo‘sh qolsa — sehrli
  // musiqa qutisi kuyi avtomatik yaratiladi.
  music: {
    src: "",
    volume: 0.55
  },

  // ── Sirli parol sarguzashti ──────────────────────────────────
  // Har bir darvoza to‘g‘ri javobdan keyin bitta "sehrli so‘z" beradi.
  // Sehrli so‘zlar birga yakuniy parolni tashkil qiladi.
  adventure: {
    intro: "Bu olamga kirish uchun uchta darvozadan o‘tib, sehrli kalitni topishing va sirli parolni aytishing kerak.",
    gates: [
      {
        title: "Birinchi darvoza",
        question: "Tunda osmonda minglab bo‘lib porlaydi, lekin sening ko‘zlaring oldida xira tortadi. Bu nima?",
        answers: ["yulduz", "yulduzlar", "yulduzcha"],
        hint: "Tepaga — tungi osmonga qara ✨",
        reward: "SEN"
      },
      {
        title: "Ikkinchi darvoza",
        question: "Uni ko‘rib ham, ushlab ham bo‘lmaydi, lekin u ikki yurakni bir-biriga bog‘laydi. Bu nima?",
        answers: ["sevgi", "muhabbat", "ishq", "mehr"],
        hint: "Bu sayt aynan shu haqida… 5 harf, «S» bilan boshlanadi.",
        reward: "VA"
      },
      {
        title: "Uchinchi darvoza",
        question: "Har kuni ertalab ko‘zimni ochishim bilan birinchi bo‘lib kimni o‘ylayman?",
        answers: ["sen", "seni", "siz", "sizni", "{herName}", "{herName}ni"],
        hint: "Javobni ko‘zguga qarasang ko‘rasan 🪞",
        reward: "MEN"
      }
    ],
    lanternText: "Sehrli bog‘ qorong‘ilikka cho‘kdi. Fonaring bilan yoritib, yashiringan oltin kalitni top.",
    password: "sen va men",
    passwordHint: "Darvozalardan olgan uchta sehrli so‘zni ketma-ket yoz."
  },

  // ── Seni sevishimning 15 sababi ──────────────────────────────
  reasons: [
    "Sening tabassuming eng qorong‘i kunimni ham yoritib yuboradi.",
    "Sen bilan jimlik ham eng go‘zal suhbatga aylanadi.",
    "Ko‘zlaringga qaraganimda, butun dunyo bir lahzaga to‘xtab qolgandek bo‘ladi.",
    "Sen meni qanday bo‘lsam, shundayligimcha qabul qilasan.",
    "Kulging — men uchun dunyodagi eng yoqimli musiqa.",
    "Qiyin paytlarda doim yonimda bo‘lding va qo‘limni hech qo‘yib yubormading.",
    "Sen bilan eng oddiy kun ham bayramga aylanadi.",
    "Mehribonliging nafaqat menga, balki atrofingdagi hammaga yetadi.",
    "Sen menga o‘zimning eng yaxshi ko‘rinishim bo‘lishga ilhom berasan.",
    "Eng kichik narsalarni ham eslab qolishing meni har safar hayratga soladi.",
    "Sen bilan kelajak haqida orzu qilish shunchalik shirinki…",
    "Ovozingni eshitsam, yuragim darhol tinchlanadi.",
    "Sen mening eng yaqin do‘stim va eng katta sevgimsan.",
    "Har bir kuning bilan meni o‘zingga yanada ko‘proq oshiq qilasan.",
    "Chunki sen — sensan. Bu dunyoda sendan boshqasi yo‘q."
  ],
  reasonsOutro: "…va yana sanab bo‘lmaydigan minglab sabablar. 💫",

  // ── Xotiralar kitobi ─────────────────────────────────────────
  // photo: "photos/1.jpg" kabi yo‘l yozing (rasmni photos/ papkasiga
  // qo‘ying). Bo‘sh qolsa, chiroyli bezakli rasm chiziladi.
  // icon: heart | star | moon | ring | music | sun | gift | infinity | camera | flower
  bookTitle: "Bizning xotiralarimiz",
  memories: [
    {
      date: "14 fevral, 2024",
      title: "Ilk uchrashuv",
      text: "O‘sha kuni osmon odatdagidan ham tiniqroq edi. Sen kulding — va men hayotim endi hech qachon avvalgidek bo‘lmasligini angladim.",
      photo: "",
      icon: "star"
    },
    {
      date: "Mart, 2024",
      title: "Birinchi uzun suhbat",
      text: "Soatlar daqiqadek o‘tib ketdi. Tong otganini ham sezmay qoldik. O‘shanda bildim: sen bilan gaplashib hech qachon charchamayman.",
      photo: "",
      icon: "moon"
    },
    {
      date: "May, 2024",
      title: "Gullar ostida",
      text: "Bahor gullari orasida yurganimizda qo‘lingni ilk bor ushladim. Yuragim shunchalik tez urardiki, sen ham eshitgandirsan.",
      photo: "",
      icon: "flower"
    },
    {
      date: "Iyul, 2024",
      title: "Birinchi sayohatimiz",
      text: "Yo‘l uzun edi, lekin sen yonimda bo‘lganing uchun u eng qisqa va eng baxtli yo‘l bo‘ldi.",
      photo: "",
      icon: "sun"
    },
    {
      date: "Oktyabr, 2024",
      title: "Yomg‘irli kun",
      text: "Bitta soyabon, ikki kishi va to‘xtovsiz kulgu. Yomg‘ir hech qachon bunchalik iliq bo‘lmagan edi.",
      photo: "",
      icon: "music"
    },
    {
      date: "Bugun",
      title: "Va bu hikoya davom etadi…",
      text: "Eng go‘zal sahifalarimiz hali oldinda. Ularni faqat sen bilan birga yozishni xohlayman.",
      photo: "",
      icon: "infinity"
    }
  ],

  // ── Sevgi maktubi ────────────────────────────────────────────
  letter: {
    greeting: "Mening azizim {herName},",
    paragraphs: [
      "Bu maktubni yozish uchun ko‘p marta qalam oldim, lekin his-tuyg‘ularimni ifodalashga so‘zlar yetmadi. Chunki sen menga bergan baxtni hech qanday so‘z bilan to‘liq aytib bo‘lmaydi.",
      "Sen hayotimga kirib kelgan kundan boshlab, dunyo boshqacha rangda ko‘rina boshladi. Tonglar yorqinroq, kechalar sokinroq, orzular esa yaqinroq bo‘lib qoldi.",
      "Rahmat — tabassuming uchun, sabring uchun, meni tushunganing uchun va har doim yonimda bo‘lganing uchun. Sen mening uyimsan, mening tinchligimsan.",
      "Va’da beraman: seni har kuni yanada ko‘proq sevaman, qadrlayman va baxtli qilish uchun qo‘limdan kelgan hamma narsani qilaman."
    ],
    closing: "Seni cheksiz sevuvchi,",
    signature: "{myName}"
  },

  // ── Viktorina (Sevgi viktorinasi) ────────────────────────────
  // correct — to‘g‘ri javob tartib raqami (0 dan boshlanadi).
  // Bir nechta to‘g‘ri javob bo‘lsa: [1, 2] kabi yozing.
  quiz: {
    passPercent: 60,
    questions: [
      {
        q: "Men seni qanchalik sevaman?",
        options: ["Ozgina", "Ancha", "Juda ko‘p", "Cheksiz ♾"],
        correct: 3,
        note: "To‘g‘ri! Hech qanday o‘lchov yetmaydi."
      },
      {
        q: "Mening dunyodagi eng sevimli joyim qayer?",
        options: ["Dengiz bo‘yi", "Tog‘lar", "Sening yoningda", "Uyda"],
        correct: 2,
        note: "Qayerda bo‘lsam ham — faqat sen yonimda bo‘lsang."
      },
      {
        q: "Qaysi so‘z bizni eng yaxshi tasvirlaydi?",
        options: ["Tasodif", "Taqdir", "Odat", "Sir"],
        correct: 1,
        note: "Biz bir-birimiz uchun yaratilganmiz."
      },
      {
        q: "Biz birga bo‘lsak…",
        options: ["Vaqt uchib o‘tadi", "Dunyo go‘zallashadi", "Hamma narsa mumkin", "Hammasi to‘g‘ri ✨"],
        correct: 3,
        note: "Ha, hammasi birdaniga!"
      },
      {
        q: "Seni sevishimga nechta sabab bor?",
        options: ["15 ta", "100 ta", "Sanab bo‘lmaydi", "Bitta: chunki sen sensan"],
        correct: [2, 3],
        note: "Ikkalasi ham to‘g‘ri edi 😊"
      }
    ]
  },

  // ── So‘z sehri o‘yini ────────────────────────────────────────
  words: [
    { word: "SEVGI", hint: "Dunyodagi eng kuchli tuyg‘u" },
    { word: "YURAK", hint: "U faqat sen uchun uradi" },
    { word: "BAXT", hint: "Sen yonimda bo‘lganingda his qiladigan narsam" },
    { word: "ORZU", hint: "Sen mening ushalgan … imsan" },
    { word: "SADOQAT", hint: "Bir-birimizga abadiy …" }
  ],

  // ── Sehrli jumboq rasmi (ixtiyoriy) ──────────────────────────
  // Bo‘sh qolsa, ismlaringiz yozilgan sehrli rasm chiziladi.
  puzzleImage: "",

  // ── Sirli xona ───────────────────────────────────────────────
  secret: {
    message: "Agar sen bu yergacha yetib kelgan bo‘lsang, demak, nafaqat yetti sinovni, balki yuragimni ham to‘liq zabt etding. Bu xonada eng katta sirim saqlanadi: men seni o‘ylagan har bir lahzamda baxtliman. Sen — mening eng go‘zal sirim va eng aniq javobim.",
    coupons: [
      "Bitta uzoq va iliq quchoq 🤗",
      "Sen tanlagan film bilan kino kechasi 🎬",
      "Men tayyorlagan maxsus kechki ovqat 🍝",
      "Sen istagan joyga sayr 🌇",
      "Bir kunlik «Ha» kuni — har istaging bajariladi 👑",
      "Gullar va shirinlik bilan kutilmagan sovg‘a 💐"
    ]
  },

  // ── Yakuniy kinematik final ──────────────────────────────────
  finale: {
    lines: [
      "Har bir hikoyaning boshlanishi bo‘ladi…",
      "Bizniki bir qarash bilan boshlandi.",
      "Keyin bitta tabassum…",
      "So‘ng minglab suhbatlar, kulgular va orzular.",
      "Butun olamim endi bitta {herName} atrofida aylanadi.",
      "Va bugun men aniq bilaman:",
      "Sen — mening eng go‘zal hikoyamsan."
    ],
    question: "{herName}, sen mening abadiy sevgim bo‘lib qolasanmi?",
    yes: "Ha, albatta! 💖",
    no: "Yo‘q",
    noTaunts: [
      "Ishonchingiz komilmi? 🥺",
      "Yana bir bor o‘ylab ko‘r…",
      "Bu tugma ishlamaydi 😅",
      "Qochib ketdim!",
      "Faqat «Ha» qoldi 💕"
    ],
    finalMessage: "Seni sevaman. Bugun, ertaga va abadiy.",
    finalSignature: "— {myName}"
  }
};
