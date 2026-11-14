"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { GCC_COUNTRY_NAMES, gccCountrySchema, type SellerAccount, type UploadPurpose } from "@/schemas";
import { ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { AccountBadge } from "@/components/dashboard/parts";
import { useCurrentUser } from "@/features/auth/hooks";
import { FormError } from "@/features/auth/field";
import { applyApiError } from "@/features/auth/form-errors";
import { acceptFor, checkFile, describeRules, uploadFile } from "@/features/upload/upload-file";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSaveProfile, useSellerAccount } from "./api";
import { describedBy, FieldBlock, focusRing, initials, inputClass } from "./parts";

/**
 * Figma "Seller – Company Profile" (179:797), dark frame converted to the
 * light Seller Centre palette: store preview card on the left, company
 * details form on the right. "Save changes" in the header submits the form.
 */

const FORM_ID = "company-profile-form";
const MAX_BRANDS = 20;

const formSchema = z.object({
  companyName: z.string().trim().min(2, "Enter your company name").max(120),
  country: z.string().refine((value) => gccCountrySchema.safeParse(value).success, "Choose a country"),
  city: z.string().trim().min(2, "Enter your city").max(80),
  phone: z
    .string()
    .trim()
    .refine((value) => /^\+[1-9]\d{6,14}$/.test(value.replace(/[\s-]/g, "")), "Use the international format, e.g. +968 9123 4567"),
  website: z.string().trim().max(200),
  about: z.string().trim().max(1000, "Keep it under 1000 characters"),
  vatRegistered: z.enum(["yes", "no"]),
});
type FormValues = z.infer<typeof formSchema>;
const FIELDS = ["companyName", "country", "city", "phone", "website", "about", "vatRegistered"] as const;

function valuesFrom(account: SellerAccount | undefined, fallbackName: string): FormValues {
  const profile = account?.profile;
  return {
    companyName: profile?.companyName ?? fallbackName,
    country: profile?.country ?? "",
    city: profile?.city ?? "",
    phone: profile?.phone ?? "",
    website: profile?.website?.replace(/^https:\/\//, "") ?? "",
    about: profile?.about ?? "",
    vatRegistered: profile?.vatRegistered ? "yes" : "no",
  };
}

/** A picked image: uploaded at once, attached to the profile on save. */
interface PickedImage {
  uploadId: string;
  previewUrl: string;
}

export function CompanyProfile() {
  const user = useCurrentUser("seller");
  const account = useSellerAccount();

  if (account.isPending) {
    return <p className="text-sm text-text-muted" role="status">Loading your company profile…</p>;
  }
  if (account.isError || !user) {
    return <FormError message="Could not load your company profile. Reload the page to try again." />;
  }
  return <ProfileEditor account={account.data} fallbackName={user.fullName} />;
}

function ProfileEditor({ account, fallbackName }: { account: SellerAccount; fallbackName: string }) {
  const save = useSaveProfile();
  const [saved, setSaved] = useState(false);
  const [brands, setBrands] = useState<string[]>(account.profile?.brands ?? []);
  const [logo, setLogo] = useState<PickedImage | null>(null);
  const underReview = account.verification.status === "pending";

  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: valuesFrom(account, fallbackName),
  });

  // Release the local previews when they are replaced or the page closes.
  useEffect(() => () => void (logo && URL.revokeObjectURL(logo.previewUrl)), [logo]);

  const onSubmit = handleSubmit((values) => {
    setSaved(false);
    save.mutate(
      {
        companyName: values.companyName,
        country: gccCountrySchema.parse(values.country),
        city: values.city,
        phone: values.phone,
        website: values.website,
        about: values.about,
        brands,
        vatRegistered: values.vatRegistered === "yes",
        ...(logo ? { logoUploadId: logo.uploadId } : {}),
      },
      {
        onSuccess: (next) => {
          reset(valuesFrom(next, fallbackName));
          setSaved(true);
          setLogo(null);
        },
        onError: (error) => applyApiError(error, setError, FIELDS),
      },
    );
  });

  const [watchedName, city, countryValue, about, vat] = useWatch({
    control,
    name: ["companyName", "city", "country", "about", "vatRegistered"],
  });
  const name = watchedName || fallbackName;
  const parsedCountry = gccCountrySchema.safeParse(countryValue);
  const country = parsedCountry.success ? parsedCountry.data : null;
  const unsaved = isDirty || logo !== null || brands.join("\n") !== (account.profile?.brands ?? []).join("\n");

  return (
    <>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 leading-[normal]">
          <p className="text-[15px] text-text-muted">What buyers see on your store page.</p>
          <h1 className="text-[28px] font-medium tracking-[-0.02em] text-text-strong sm:text-[40px]">Company profile</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {saved && !unsaved ? (
            <p role="status" className="text-sm font-medium text-text-muted">
              Saved
            </p>
          ) : null}
          <Link
            href="/seller/store"
            className={cn(
              "flex h-[52px] items-center justify-center rounded-full border-[1.5px] border-text-strong px-7 text-base font-semibold whitespace-nowrap text-text-strong hover:bg-black/4",
              focusRing,
            )}
          >
            Preview store
          </Link>
          <button
            type="submit"
            form={FORM_ID}
            disabled={save.isPending}
            className={cn(
              "flex h-[52px] items-center justify-center rounded-full bg-side-accent px-7 text-base font-semibold whitespace-nowrap text-white hover:opacity-90 disabled:opacity-60",
              focusRing,
            )}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
        <StorePreview
          name={name}
          location={[city, country ? GCC_COUNTRY_NAMES[country] : ""].filter(Boolean).join(", ")}
          about={about}
          brandCount={brands.length}
          logoUrl={logo?.previewUrl ?? account.profile?.logo?.url ?? null}
          onLogo={setLogo}
        />

        <form
          id={FORM_ID}
          method="post"
          noValidate
          onSubmit={onSubmit}
          aria-label="Company details"
          className="flex min-w-0 flex-1 flex-col gap-[22px] rounded-[24px] bg-panel px-5 py-6 sm:px-[30px] sm:py-7"
        >
          <h2 className="text-xl leading-[normal] font-medium text-text-strong">Company details</h2>
          <FormError message={errors.root?.server?.message} />
          {underReview ? (
            <p role="note" className="rounded-[12px] bg-surface px-4 py-3 text-sm leading-normal text-text-body">
              Your company is being reviewed, so the company name, country and VAT status are locked until the review is done.
            </p>
          ) : account.verification.status === "approved" ? (
            <p role="note" className="rounded-[12px] bg-surface px-4 py-3 text-sm leading-normal text-text-body">
              Changing the company name, country or VAT status sends your company for review again.
            </p>
          ) : null}

          <div className="flex flex-col gap-[18px] sm:flex-row">
            <FieldBlock id="companyName" label="Company name" error={errors.companyName?.message}>
              <input
                id="companyName"
                autoComplete="organization"
                readOnly={underReview}
                aria-invalid={errors.companyName ? true : undefined}
                aria-describedby={describedBy("companyName", errors.companyName?.message)}
                className={inputClass}
                {...register("companyName")}
              />
            </FieldBlock>
            <FieldBlock id="phone" label="Phone" error={errors.phone?.message}>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="+968 9123 4567"
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={describedBy("phone", errors.phone?.message)}
                className={inputClass}
                {...register("phone")}
              />
            </FieldBlock>
          </div>

          <div className="flex flex-col gap-[18px] sm:flex-row">
            <FieldBlock id="country" label="Country" error={errors.country?.message}>
              {underReview ? (
                <>
                  <input id="country" readOnly value={country ? GCC_COUNTRY_NAMES[country] : ""} className={inputClass} />
                  <input type="hidden" {...register("country")} />
                </>
              ) : (
              <div className="relative">
                <select
                  id="country"
                  aria-invalid={errors.country ? true : undefined}
                  aria-describedby={describedBy("country", errors.country?.message)}
                  className={cn(inputClass, "appearance-none pr-11")}
                  {...register("country")}
                >
                  <option value="" disabled>
                    Choose a country
                  </option>
                  {gccCountrySchema.options.map((code) => (
                    <option key={code} value={code}>
                      {GCC_COUNTRY_NAMES[code]}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-[18px] -translate-y-1/2 text-text-muted" />
              </div>
              )}
            </FieldBlock>
            <FieldBlock id="city" label="City" error={errors.city?.message}>
              <input
                id="city"
                autoComplete="address-level2"
                placeholder="Muscat"
                aria-invalid={errors.city ? true : undefined}
                aria-describedby={describedBy("city", errors.city?.message)}
                className={inputClass}
                {...register("city")}
              />
            </FieldBlock>
          </div>

          <div className="flex flex-col gap-[18px] sm:flex-row">
            <FieldBlock id="website" label="Website" optional error={errors.website?.message}>
              <input
                id="website"
                type="text"
                inputMode="url"
                autoComplete="url"
                placeholder="alnoorparts.om"
                aria-invalid={errors.website ? true : undefined}
                aria-describedby={describedBy("website", errors.website?.message)}
                className={inputClass}
                {...register("website")}
              />
            </FieldBlock>
            {underReview ? (
              <FieldBlock id="vatRegistered" label="VAT registered">
                <input id="vatRegistered" readOnly value={vat === "yes" ? "Yes" : "No"} className={inputClass} />
                <input type="hidden" {...register("vatRegistered")} />
              </FieldBlock>
            ) : (
            <fieldset className="flex min-w-0 flex-1 flex-col gap-2">
              <legend className="mb-2 text-sm leading-[normal] font-medium text-text-strong">VAT registered</legend>
              <div className="flex h-[52px] gap-1 rounded-[12px] border border-line bg-panel p-1">
                {(["yes", "no"] as const).map((value) => (
                  <label
                    key={value}
                    className="flex flex-1 cursor-pointer items-center justify-center rounded-[9px] text-[15px] font-medium text-text-muted has-checked:bg-sidebar-bg has-checked:text-white has-focus-visible:ring-3 has-focus-visible:ring-brand-blue/40 has-disabled:cursor-not-allowed"
                  >
                    <input type="radio" value={value} className="sr-only" {...register("vatRegistered")} />
                    {value === "yes" ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </fieldset>
            )}
          </div>

          <FieldBlock id="about" label="About" error={errors.about?.message}>
            <textarea
              id="about"
              rows={4}
              maxLength={1000}
              placeholder="What you sell and where you deliver."
              aria-invalid={errors.about ? true : undefined}
              aria-describedby={describedBy("about", errors.about?.message)}
              className={cn(inputClass, "h-[120px] resize-none py-3.5")}
              {...register("about")}
            />
          </FieldBlock>

          <BrandChips brands={brands} onChange={setBrands} />
        </form>
      </div>
    </>
  );
}

/** Left card: how the store looks to buyers, with the logo picker. */
function StorePreview({
  name,
  location,
  about,
  brandCount,
  logoUrl,
  onLogo,
}: {
  name: string;
  location: string;
  about: string;
  brandCount: number;
  logoUrl: string | null;
  onLogo: (image: PickedImage) => void;
}) {
  const [error, setError] = useState<string>();
  return (
    <section aria-label="Store preview" className="flex w-full shrink-0 flex-col overflow-hidden rounded-[24px] bg-panel lg:w-[400px]">
      <div className="flex flex-col gap-5 px-7 pt-7 pb-7">
        <div className="relative flex flex-col gap-3.5 pt-[94px]">
          <div className="absolute top-0 left-0 flex size-20 items-center justify-center overflow-hidden rounded-[20px] bg-seller-orange">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
              <img src={logoUrl} alt={`${name} logo`} className="size-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="text-[26px] leading-[normal] font-semibold text-white">{initials(name)}</span>
            )}
          </div>
          <ImagePicker
            purpose="seller_logo"
            label={logoUrl ? "Change logo" : "Add logo"}
            onPicked={onLogo}
            onError={setError}
            className="absolute top-[30px] left-[92px] rounded-full px-2 py-1 text-xs font-medium text-text-muted underline-offset-2 hover:text-text-strong hover:underline"
          />
          <div className="flex min-w-0 flex-col gap-1.5 leading-[normal]">
            <p className="text-2xl font-medium tracking-[-0.01em] break-words text-text-strong">{name}</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <AccountBadge label="Seller account" dotClass="bg-success" />
              {location ? <p className="text-sm text-text-muted">{location}</p> : null}
            </div>
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-[13px] leading-[normal] text-destructive">
            {error}
          </p>
        ) : null}
        <p className={cn("text-[15px] leading-normal break-words whitespace-pre-line", about ? "text-text-body" : "text-text-subtle")}>
          {about || "Tell buyers what you sell and where you deliver."}
        </p>
        <div className="h-px bg-line" />
        <dl className="flex gap-8 leading-[normal]">
          {[
            { label: "Products", value: 0 },
            { label: "Store views", value: 0 },
            { label: "Brands", value: brandCount },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse gap-0.5">
              <dt className="text-[13px] text-text-subtle">{stat.label}</dt>
              <dd className="text-[28px] text-text-strong">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** A button that opens the file chooser, uploads the image and hands back a preview. */
function ImagePicker({
  purpose,
  label,
  onPicked,
  onError,
  className,
}: {
  purpose: UploadPurpose;
  label: string;
  onPicked: (image: PickedImage) => void;
  onError: (message: string | undefined) => void;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = checkFile(purpose, file);
    if (problem) {
      onError(problem);
      return;
    }
    onError(undefined);
    setBusy(true);
    try {
      const uploadId = await uploadFile("seller", purpose, file);
      onPicked({ uploadId, previewUrl: URL.createObjectURL(file) });
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "The upload did not finish. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        title={describeRules(purpose)}
        className={cn("leading-[normal] disabled:opacity-60", focusRing, className)}
      >
        {busy ? "Uploading…" : label}
      </button>
      <input ref={input} type="file" accept={acceptFor(purpose)} className="hidden" onChange={onChange} />
    </>
  );
}

/** "Brands you carry": chips with remove buttons and an inline "+ Add brand". */
function BrandChips({ brands, onChange }: { brands: string[]; onChange: (brands: string[]) => void }) {
  const inputId = useId();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();

  function commit() {
    const value = draft.trim().replace(/\s+/g, " ");
    if (!value) {
      setAdding(false);
      return;
    }
    if (value.length > 40) return setError("Keep brand names under 40 characters.");
    if (brands.some((brand) => brand.toLowerCase() === value.toLowerCase())) return setError("That brand is already listed.");
    onChange([...brands, value]);
    setDraft("");
    setError(undefined);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      setDraft("");
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm leading-[normal] font-medium text-text-strong" id={`${inputId}-label`}>
        Brands you carry
      </p>
      <ul aria-labelledby={`${inputId}-label`} className="flex flex-wrap gap-2">
        {brands.map((brand) => (
          <li key={brand} className="flex items-center gap-1 rounded-full bg-surface py-[7px] pr-2 pl-3.5 text-[13px] leading-[normal] font-medium text-text-strong">
            {brand}
            <button
              type="button"
              aria-label={`Remove ${brand}`}
              onClick={() => onChange(brands.filter((item) => item !== brand))}
              className={cn("flex size-4 items-center justify-center rounded-full text-text-muted hover:text-text-strong", focusRing)}
            >
              <X aria-hidden className="size-3" />
            </button>
          </li>
        ))}
        <li>
          {adding ? (
            <input
              id={inputId}
              autoFocus
              value={draft}
              maxLength={40}
              aria-label="Brand name"
              placeholder="Brand name"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              onBlur={commit}
              className={cn("h-[31px] w-36 rounded-full border border-line px-3.5 text-[13px] text-text-strong", focusRing)}
            />
          ) : brands.length < MAX_BRANDS ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={cn(
                "rounded-full border border-dashed border-line px-3.5 py-[7px] text-[13px] leading-[normal] font-medium text-text-muted hover:text-text-strong",
                focusRing,
              )}
            >
              + Add brand
            </button>
          ) : null}
        </li>
      </ul>
      {error ? <p className="text-[13px] leading-[normal] text-destructive">{error}</p> : null}
    </div>
  );
}
