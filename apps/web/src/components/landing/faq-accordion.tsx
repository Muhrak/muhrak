"use client";

import Image from "next/image";
import { useId, useState } from "react";

/** FAQ items from Figma "Buyer – Landing v2 (Light)" › FAQ. The first one starts open, as in the design. */
const ITEMS = [
  {
    question: "What is Muhrak?",
    answer:
      "Muhrak is the spare parts marketplace for the Gulf. Search verified sellers, or snap a photo and Muhrak AI finds the part for you.",
  },
  {
    question: "How does Muhrak AI identify a part?",
    answer:
      "Upload one clear photo of the part. Muhrak AI suggests what it is and fills in the details, and you can correct anything before your request goes to sellers.",
  },
  {
    question: "Are the sellers verified?",
    answer:
      "Yes. Every seller sends us their commercial registration and business documents, and our team approves them before they can send quotes.",
  },
  {
    question: "Which countries do you cover?",
    answer: "All six GCC countries: Oman, the United Arab Emirates, Saudi Arabia, Qatar, Kuwait and Bahrain.",
  },
  {
    question: "Do I pay to request a quote?",
    answer: "No. Requesting quotes is free. You agree the price with the seller and pay them directly.",
  },
];

export function FaqAccordion() {
  const [open, setOpen] = useState(0);
  const baseId = useId();

  return (
    <div className="flex w-full max-w-[720px] flex-col gap-2.5">
      {ITEMS.map((item, index) => {
        const isOpen = open === index;
        const panelId = `${baseId}-panel-${index}`;
        return (
          <div key={item.question} className="rounded-[12px] border border-black/9 bg-black/4">
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? -1 : index)}
                className="flex w-full items-center gap-3 rounded-[12px] px-[22px] py-[18px] text-left text-[15px] leading-[1.3] text-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="min-w-0 flex-1">{item.question}</span>
                <Image src={isOpen ? "/landing/chevron-up.svg" : "/landing/chevron-down.svg"} alt="" width={16} height={16} />
              </button>
            </h3>
            <div id={panelId} hidden={!isOpen} className="-mt-2 px-[22px] pb-[18px]">
              <p className="text-sm leading-[1.55] text-ink-tertiary">{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
