import type { ReactNode } from "react";

const noticeClass = {
  page: {
    error: "mb-4 rounded-md bg-ember/10 px-3 py-2 text-sm text-ember",
    success: "mb-4 rounded-md bg-mint/10 px-3 py-2 text-sm text-mint"
  },
  panel: {
    error: "mt-4 rounded-md bg-ember/10 px-3 py-2 text-sm text-ember",
    success: "mt-4 rounded-md bg-mint/10 px-3 py-2 text-sm text-mint"
  },
  form: {
    error: "rounded-md bg-ember/10 px-3 py-2 text-sm text-ember",
    success: "rounded-md bg-mint/10 px-3 py-2 text-sm text-mint"
  }
} as const;

type NoticeProps = {
  children: ReactNode;
  space?: keyof typeof noticeClass;
  tone: "error" | "success";
};

export function Notice({ children, space = "page", tone }: NoticeProps) {
  return <p className={noticeClass[space][tone]}>{children}</p>;
}
