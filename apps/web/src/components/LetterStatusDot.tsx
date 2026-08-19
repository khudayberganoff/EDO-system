import { LetterStatus } from "@edo/shared-types";
import clsx from "clsx";
const CONFIG: Record<LetterStatus,{className:string;label:string}> = {
 [LetterStatus.DRAFT]: {className:"bg-slate-400",label:"Qoralama"},
 [LetterStatus.PENDING_APPROVAL]: {className:"bg-amber-500",label:"Rahbariyat tasdig‘ida"},
 [LetterStatus.APPROVED]: {className:"bg-emerald-500",label:"Tasdiqlangan"},
 [LetterStatus.REJECTED]: {className:"bg-rose-500",label:"Rad etilgan"},
 [LetterStatus.ARCHIVED]: {className:"bg-emerald-700",label:"Arxivda"},
 [LetterStatus.DELETED]: {className:"bg-slate-800",label:"O‘chirilgan"},
};
export function LetterStatusDot({status}:{status:LetterStatus}){const c=CONFIG[status]; return <span title={c.label} className={clsx("inline-block h-2.5 w-2.5 rounded-full",c.className)}/>;}
