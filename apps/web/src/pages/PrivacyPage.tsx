import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { ShieldCheck, Trash2 } from "lucide-react";
import clsx from "clsx";
import { fetchPublicContact } from "../api/meta";
import { useLanguage } from "../i18n/LanguageContext";
import { LANGUAGES, type Language } from "../i18n/translations";

type Section = { h: string; p: string[] };
type Doc = { title: string; updated: string; intro: string; sections: Section[]; contact: string; noContact: string };

const UPDATED = "16.11.2026";

/** Maxfiylik siyosati (Meta ilovasi talabi) - uch tilda */
const PRIVACY: Record<Language, Doc> = {
  uz: {
    title: "Maxfiylik siyosati",
    updated: `Oxirgi yangilanish: ${UPDATED}`,
    intro: "Ushbu siyosat WAFA GROUP Call-markazi (call.wafagroup.uz) mijozlar so'rovlari bilan ishlashda shaxsiy ma'lumotlarni qanday yig'ishi, ishlatishi va himoya qilishini tushuntiradi.",
    sections: [
      { h: "Qanday ma'lumot yig'iladi", p: [
        "Facebook va Instagram'dagi reklama lid formalarida o'zingiz qoldirgan ma'lumotlar: ism, telefon raqami va formadagi savollarga javoblaringiz.",
        "Ariza qaysi reklama, kampaniya va formadan kelgani haqidagi texnik ma'lumot.",
        "Biz bilan telefon orqali bog'langaningizda qo'ng'iroq vaqti, davomiyligi va (agar ogohlantirilgan bo'lsa) suhbat yozuvi.",
        "Biz Facebook yoki Instagram profilingizga, parolingizga, xabarlaringizga yoki do'stlaringiz ro'yxatiga kira olmaymiz.",
      ] },
      { h: "Ma'lumot nima uchun ishlatiladi", p: [
        "So'rovingiz bo'yicha siz bilan bog'lanish, xizmatlarimiz (lizing va moliyaviy xizmatlar) haqida ma'lumot berish, uchrashuv belgilash va shartnoma rasmiylashtirish.",
        "Xizmat sifatini nazorat qilish va reklama samaradorligini baholash.",
      ] },
      { h: "Saqlash va himoya", p: [
        "Ma'lumotlar himoyalangan serverda saqlanadi, ularga faqat vakolatli xodimlar kirishi mumkin. Kirish tokenlari shifrlangan holda saqlanadi.",
        "Ma'lumotlaringiz uchinchi shaxslarga sotilmaydi va berilmaydi, qonunda belgilangan hollar bundan mustasno.",
      ] },
      { h: "Saqlash muddati", p: [
        "Ma'lumotlar siz bilan munosabatlar davomida va qonunchilikda belgilangan muddat davomida saqlanadi, so'ng o'chiriladi yoki so'rovingiz bo'yicha oldinroq o'chiriladi.",
      ] },
      { h: "Sizning huquqlaringiz", p: [
        "Siz o'zingiz haqingizdagi ma'lumotni ko'rish, tuzatish yoki o'chirishni so'rashingiz mumkin. O'chirish tartibi: «Ma'lumotlarni o'chirish» sahifasida.",
      ] },
    ],
    contact: "Murojaat uchun:",
    noContact: "Murojaat uchun WAFA GROUP Call-markaziga qo'ng'iroq qiling.",
  },
  ru: {
    title: "Политика конфиденциальности",
    updated: `Последнее обновление: ${UPDATED}`,
    intro: "Настоящая политика объясняет, как колл-центр WAFA GROUP (call.wafagroup.uz) собирает, использует и защищает персональные данные при работе с обращениями клиентов.",
    sections: [
      { h: "Какие данные собираются", p: [
        "Данные, которые вы сами оставили в рекламных лид-формах Facebook и Instagram: имя, номер телефона и ответы на вопросы формы.",
        "Техническая информация о том, из какого объявления, кампании и формы пришла заявка.",
        "При звонке к нам — время и длительность звонка и (если вы были предупреждены) запись разговора.",
        "Мы не получаем доступа к вашему профилю Facebook или Instagram, паролю, сообщениям или списку друзей.",
      ] },
      { h: "Для чего используются данные", p: [
        "Чтобы связаться с вами по вашей заявке, рассказать о наших услугах (лизинг и финансовые услуги), назначить встречу и оформить договор.",
        "Для контроля качества обслуживания и оценки эффективности рекламы.",
      ] },
      { h: "Хранение и защита", p: [
        "Данные хранятся на защищённом сервере, доступ к ним есть только у уполномоченных сотрудников. Токены доступа хранятся в зашифрованном виде.",
        "Ваши данные не продаются и не передаются третьим лицам, кроме случаев, предусмотренных законом.",
      ] },
      { h: "Срок хранения", p: [
        "Данные хранятся в течение наших отношений и срока, установленного законодательством, затем удаляются, либо раньше — по вашему запросу.",
      ] },
      { h: "Ваши права", p: [
        "Вы можете запросить просмотр, исправление или удаление данных о себе. Порядок удаления — на странице «Удаление данных».",
      ] },
    ],
    contact: "Для обращений:",
    noContact: "Для обращений позвоните в колл-центр WAFA GROUP.",
  },
  en: {
    title: "Privacy Policy",
    updated: `Last updated: ${UPDATED}`,
    intro: "This policy explains how the WAFA GROUP call center (call.wafagroup.uz) collects, uses and protects personal data when handling customer requests.",
    sections: [
      { h: "What we collect", p: [
        "Information you submit in Facebook and Instagram lead ad forms: your name, phone number and answers to the form questions.",
        "Technical information about which ad, campaign and form the request came from.",
        "When you call us: the time and duration of the call and, if you were notified, a recording of the conversation.",
        "We do not get access to your Facebook or Instagram profile, password, messages or friends list.",
      ] },
      { h: "How we use it", p: [
        "To contact you about your request, tell you about our services (leasing and financial services), schedule a meeting and prepare a contract.",
        "To monitor service quality and measure advertising effectiveness.",
      ] },
      { h: "Storage and security", p: [
        "Data is stored on a protected server and is accessible only to authorized staff. Access tokens are stored encrypted.",
        "We do not sell or share your data with third parties, except where required by law.",
      ] },
      { h: "Retention", p: [
        "Data is kept for the duration of our relationship and the period required by law, then deleted — or earlier at your request.",
      ] },
      { h: "Your rights", p: [
        "You may request to view, correct or delete your data. See the «Data deletion» page for how to do this.",
      ] },
    ],
    contact: "Contact:",
    noContact: "To contact us, call the WAFA GROUP call center.",
  },
};

/** Ma'lumotlarni o'chirish yo'riqnomasi (Meta: User data deletion instructions URL) */
const DELETION: Record<Language, Doc> = {
  uz: {
    title: "Ma'lumotlarni o'chirish",
    updated: `Oxirgi yangilanish: ${UPDATED}`,
    intro: "Agar siz Facebook yoki Instagram lid formasi orqali bizga ariza qoldirgan bo'lsangiz va ma'lumotlaringiz o'chirilishini istasangiz:",
    sections: [
      { h: "Qanday so'rov yuboriladi", p: [
        "Quyidagi emailga «Ma'lumotlarimni o'chiring» mavzusida xat yuboring va arizada ko'rsatgan ism hamda telefon raqamingizni yozing.",
        "So'rovingiz 30 kun ichida bajariladi: ariza, izohlar va unga bog'liq ma'lumotlar tizimimizdan o'chiriladi. Natija haqida javob yuboramiz.",
        "Qonunchilik bo'yicha saqlanishi shart bo'lgan ma'lumotlar (masalan, tuzilgan shartnoma hujjatlari) belgilangan muddat tugaguncha saqlanadi.",
      ] },
    ],
    contact: "So'rov uchun email:",
    noContact: "So'rov uchun WAFA GROUP Call-markaziga qo'ng'iroq qiling.",
  },
  ru: {
    title: "Удаление данных",
    updated: `Последнее обновление: ${UPDATED}`,
    intro: "Если вы оставили нам заявку через лид-форму Facebook или Instagram и хотите удалить свои данные:",
    sections: [
      { h: "Как отправить запрос", p: [
        "Отправьте письмо на указанный ниже email с темой «Удалите мои данные» и укажите имя и номер телефона из заявки.",
        "Запрос выполняется в течение 30 дней: заявка, комментарии и связанные данные удаляются из нашей системы. Мы сообщим вам о результате.",
        "Данные, которые по закону обязательно хранить (например, документы заключённого договора), хранятся до окончания установленного срока.",
      ] },
    ],
    contact: "Email для запроса:",
    noContact: "Для запроса позвоните в колл-центр WAFA GROUP.",
  },
  en: {
    title: "Data deletion",
    updated: `Last updated: ${UPDATED}`,
    intro: "If you submitted a request to us through a Facebook or Instagram lead form and want your data deleted:",
    sections: [
      { h: "How to request deletion", p: [
        "Send an email to the address below with the subject «Delete my data», including the name and phone number you used in the form.",
        "We complete requests within 30 days: the request, notes and related data are deleted from our system, and we will confirm the result.",
        "Data we are legally required to keep (for example, signed contract documents) is kept until the required period ends.",
      ] },
    ],
    contact: "Email for requests:",
    noContact: "To make a request, call the WAFA GROUP call center.",
  },
};

/** Ochiq sahifa (kirishsiz): /privacy - maxfiylik siyosati, /data-deletion - ma'lumotlarni o'chirish. */
export function PrivacyPage() {
  const kind = useLocation().pathname.startsWith("/data-deletion") ? "deletion" : "privacy";
  const { language, setLanguage } = useLanguage();
  const { data } = useQuery({ queryKey: ["meta", "public-contact"], queryFn: fetchPublicContact, retry: false });
  const doc = (kind === "privacy" ? PRIVACY : DELETION)[language];
  const other = kind === "privacy" ? { href: "/data-deletion", label: DELETION[language].title } : { href: "/privacy", label: PRIVACY[language].title };
  const Icon = kind === "privacy" ? ShieldCheck : Trash2;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 text-sm font-semibold text-brand-700">WAFA GROUP · Call-markaz</div>
            <h1 className="font-display flex items-center gap-2 text-3xl font-semibold text-brand-950"><Icon size={26} className="text-brand-700" /> {doc.title}</h1>
            <p className="mt-1 text-xs text-slate-400">{doc.updated}</p>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {LANGUAGES.map((l) => (
              <button key={l.code} onClick={() => setLanguage(l.code)} className={clsx("rounded-md px-3 py-1 text-xs font-semibold", language === l.code ? "bg-white text-brand-800 shadow-sm" : "text-slate-500")}>{l.short}</button>
            ))}
          </div>
        </div>
        <p className="mb-6 text-slate-700">{doc.intro}</p>
        {doc.sections.map((s) => (
          <section key={s.h} className="mb-6">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">{s.h}</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-slate-700">
              {s.p.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </section>
        ))}
        <div className="rounded-xl bg-slate-50 p-4 text-slate-700">
          {data?.email ? <>{doc.contact} <a href={`mailto:${data.email}`} className="font-medium text-brand-700 hover:underline">{data.email}</a></> : doc.noContact}
        </div>
        <div className="mt-6 text-sm"><a href={other.href} className="text-brand-700 hover:underline">{other.label} →</a></div>
      </div>
    </div>
  );
}
