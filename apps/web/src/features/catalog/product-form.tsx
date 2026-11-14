"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CONDITION_LABELS,
  normalizePartNumber,
  PART_SOURCE_LABELS,
  priceInputSchema,
  PRODUCT_LIMITS,
  productConditionSchema,
  productUnitSchema,
  UNIT_LABELS,
  type Fitment,
  type Product,
  type ProductInput,
  type ProductStatusAction,
} from "@/schemas";
import { ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { FormError } from "@/features/auth/field";
import { applyApiError } from "@/features/auth/form-errors";
import { useSellerAccount } from "@/features/seller/api";
import { describedBy, FieldBlock, focusRing, inputClass } from "@/features/seller/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCategories, useCreateProduct, useProductStatus, useUpdateProduct } from "./api";
import { ProductStatusChip, toDecimalText } from "./parts";
import { PhotoPicker, type PhotoItem } from "./photo-picker";

/**
 * Figma "Seller – Add product (Light)" (121:335): the "Product form" card
 * with Photos, Product name / Part number, Category / Condition, Price /
 * Quantity in stock and Description, exactly as designed. A second card in
 * the same style holds what buyers search by (from real buyer requests:
 * other part numbers, machines it fits, brand, genuine or aftermarket,
 * unit, lead time).
 *
 * Every rule is enforced again by the API; this form only helps.
 */

const FORM_ID = "product-form";

const formSchema = z
  .object({
    name: z.string().trim().min(3, "Enter a product name of at least 3 characters").max(120),
    partNumber: z.string().trim().max(40),
    categoryId: z.string().min(1, "Choose a category"),
    condition: productConditionSchema,
    price: z.string().trim(),
    priceOnRequest: z.boolean(),
    stock: z.string().trim().regex(/^\d{0,7}$/, "Enter a whole number"),
    description: z.string().trim().max(2000),
    brand: z.string().trim().max(60),
    partSource: z.enum(["", "genuine", "aftermarket"]),
    unit: productUnitSchema,
    availability: z.enum(["in_stock", "on_order"]),
    leadTimeDays: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (!values.priceOnRequest) {
      const price = priceInputSchema.safeParse(values.price);
      if (!price.success) ctx.addIssue({ code: "custom", path: ["price"], message: price.error.issues[0]?.message ?? "Enter a price" });
      else if (/^0+(\.0+)?$/.test(values.price)) ctx.addIssue({ code: "custom", path: ["price"], message: "The price must be more than zero" });
    }
    if (values.availability === "on_order") {
      const days = Number(values.leadTimeDays);
      if (!/^\d{1,3}$/.test(values.leadTimeDays) || days < 1 || days > PRODUCT_LIMITS.maxLeadTimeDays) {
        ctx.addIssue({ code: "custom", path: ["leadTimeDays"], message: "Enter 1 to 365 days" });
      }
    }
  });
type FormValues = z.infer<typeof formSchema>;

const FIELDS = ["name", "partNumber", "categoryId", "condition", "price", "stock", "description", "brand", "unit", "leadTimeDays"] as const;

function valuesFrom(product: Product | null): FormValues {
  return {
    name: product?.name ?? "",
    partNumber: product?.partNumbers[0] ?? "",
    categoryId: product?.category.id ?? "",
    condition: product?.condition ?? "new",
    price: product?.price ? toDecimalText(product.price) : "",
    priceOnRequest: product ? product.price === null : false,
    stock: product?.stockQuantity === null || product?.stockQuantity === undefined ? "" : String(product.stockQuantity),
    description: product?.description ?? "",
    brand: product?.brand ?? "",
    partSource: product?.partSource ?? "",
    unit: product?.unit ?? "piece",
    availability: product?.availability ?? "in_stock",
    leadTimeDays: product?.leadTimeDays ? String(product.leadTimeDays) : "",
  };
}

function photosFrom(product: Product | null): PhotoItem[] {
  return (product?.photos ?? []).map((photo) => ({
    key: photo.uploadId,
    uploadId: photo.uploadId,
    previewUrl: photo.thumbUrl,
    state: "ready",
    local: false,
  }));
}

function toInput(values: FormValues, extraPartNumbers: string[], fitments: Fitment[], photos: PhotoItem[]): ProductInput {
  return {
    name: values.name,
    categoryId: values.categoryId,
    partNumbers: [values.partNumber, ...extraPartNumbers].map((value) => value.trim()).filter(Boolean),
    brand: values.brand || null,
    partSource: values.partSource || null,
    condition: values.condition,
    price: values.priceOnRequest ? null : values.price,
    unit: values.unit,
    stockQuantity: values.stock === "" ? null : Number(values.stock),
    availability: values.availability,
    leadTimeDays: values.availability === "on_order" ? Number(values.leadTimeDays) : null,
    description: values.description || null,
    fitments,
    photoUploadIds: photos.flatMap((photo) => (photo.state === "ready" && photo.uploadId ? [photo.uploadId] : [])),
  };
}

const outlineButton = cn(
  "flex h-[52px] items-center justify-center rounded-full border-[1.5px] border-text-strong px-7 text-base font-semibold whitespace-nowrap text-text-strong hover:bg-black/4 disabled:opacity-60",
  focusRing,
);
const primaryButton = cn(
  "flex h-[52px] items-center justify-center rounded-full bg-side-accent px-7 text-base font-semibold whitespace-nowrap text-white hover:opacity-90 disabled:opacity-60",
  focusRing,
);

/** Add product (`product` null) or edit an existing one. */
export function ProductForm({ product }: { product: Product | null }) {
  const router = useRouter();
  const account = useSellerAccount();
  const categories = useCategories();
  const create = useCreateProduct();
  const update = useUpdateProduct(product?.id ?? "");
  const status = useProductStatus();

  const [photos, setPhotos] = useState<PhotoItem[]>(() => photosFrom(product));
  const [extraPartNumbers, setExtraPartNumbers] = useState<string[]>(() => product?.partNumbers.slice(1) ?? []);
  const [fitments, setFitments] = useState<Fitment[]>(() => product?.fitments ?? []);
  const [saved, setSaved] = useState(false);
  const [stale, setStale] = useState(false);
  const [listError, setListError] = useState<string>();

  const verified = account.data?.verification.status === "approved";
  const archived = product?.status === "archived";
  const uploading = photos.some((photo) => photo.state === "uploading");
  const busy = create.isPending || update.isPending || status.isPending;

  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: valuesFrom(product) });
  const [priceOnRequest, availability] = useWatch({ control, name: ["priceOnRequest", "availability"] });

  function checkLists(): boolean {
    const blank = fitments.findIndex((fit) => !fit.make.trim() || !fit.model.trim());
    if (blank >= 0) {
      setListError("Fill in the make and model of every machine, or remove the empty row.");
      return false;
    }
    setListError(undefined);
    return true;
  }

  function onApiError(error: unknown) {
    if (error instanceof ApiError && error.status === 409 && error.message.includes("another window")) setStale(true);
    applyApiError(error, setError, FIELDS, { partNumbers: "partNumber", stockQuantity: "stock" });
  }

  /** Create (then optionally publish), or save the edit. */
  const submit = (publish: boolean) =>
    handleSubmit((values) => {
      if (!checkLists()) return;
      setSaved(false);
      const input = toInput(values, extraPartNumbers, fitments, photos);
      if (!product) {
        create.mutate(input, {
          onError: onApiError,
          onSuccess: (created) => {
            if (!publish) {
              router.push("/seller/products?saved=draft");
              return;
            }
            status.mutate(
              { id: created.id, action: "publish" },
              {
                // Saved as a draft; publishing failed (e.g. no photo yet): open the draft with the reason.
                onError: (error) => router.push(`/seller/products/${created.id}?publish=${encodeURIComponent(error instanceof ApiError ? error.message : "failed")}`),
                onSuccess: () => router.push("/seller/products?saved=published"),
              },
            );
          },
        });
        return;
      }
      update.mutate(
        { version: product.version, product: input },
        {
          onError: onApiError,
          onSuccess: (next) => {
            reset(valuesFrom(next));
            setPhotos(photosFrom(next));
            setSaved(true);
          },
        },
      );
    });

  function changeStatus(action: ProductStatusAction) {
    if (!product) return;
    status.mutate({ id: product.id, action }, { onError: onApiError, onSuccess: (next) => reset(valuesFrom(next)) });
  }

  const publishNote =
    account.data && !verified
      ? "Only verified sellers can publish. You can save this product as a draft now and publish it once your company is verified."
      : null;
  const statusError = status.error instanceof ApiError ? status.error.message : status.error ? "Something went wrong. Please try again." : undefined;

  return (
    <>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 leading-[normal]">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px]">
            <Link href="/seller/products" className={cn("rounded-sm text-text-muted hover:text-text-strong", focusRing)}>
              Products
            </Link>
            <span aria-hidden className="text-text-subtle">
              /
            </span>
            <span className="font-medium text-text-strong">{product ? "Edit product" : "Add product"}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 truncate text-[28px] font-medium tracking-[-0.02em] text-text-strong sm:text-[40px]">
              {product ? product.name : "Add product"}
            </h1>
            {product ? <ProductStatusChip status={product.status} stock={product.stockQuantity} /> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {saved ? (
            <p role="status" className="text-sm font-medium text-text-muted">
              Saved
            </p>
          ) : null}
          <Link href="/seller/products" className={outlineButton}>
            Cancel
          </Link>
          {!product ? (
            <>
              <button type="submit" form={FORM_ID} disabled={busy || uploading} className={outlineButton}>
                Save draft
              </button>
              <button
                type="button"
                onClick={submit(true)}
                disabled={busy || uploading || !verified}
                title={publishNote ?? undefined}
                className={primaryButton}
              >
                {busy ? "Saving…" : "Publish product"}
              </button>
            </>
          ) : archived ? (
            <button type="button" onClick={() => changeStatus("restore")} disabled={busy} className={primaryButton}>
              Restore as draft
            </button>
          ) : (
            <button type="submit" form={FORM_ID} disabled={busy || uploading} className={primaryButton}>
              {update.isPending ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
      </div>

      {stale ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[16px] bg-seller-orange/12 px-5 py-4 text-sm text-text-strong">
          This product was changed in another window. Reload to get the latest version (your unsaved changes here will be lost).
          <button type="button" onClick={() => window.location.reload()} className={cn("font-semibold underline", focusRing)}>
            Reload
          </button>
        </div>
      ) : null}

      {product && !archived ? (
        <StatusBar product={product} verified={verified} busy={busy} onAction={changeStatus} error={statusError} />
      ) : null}
      {!product && publishNote ? (
        <p role="note" className="rounded-[16px] bg-panel px-5 py-4 text-sm leading-normal text-text-body">
          {publishNote}{" "}
          <Link href="/seller/verification" className="font-semibold text-text-strong underline">
            Go to verification
          </Link>
        </p>
      ) : null}

      <form
        id={FORM_ID}
        method="post"
        noValidate
        onSubmit={submit(false)}
        aria-label="Product details"
        className="flex flex-col gap-5"
      >
        <fieldset disabled={archived} className="flex min-w-0 flex-col gap-5 disabled:opacity-70">
          <section aria-label="Product" className="flex flex-col gap-5 rounded-[24px] bg-panel px-5 pt-7 pb-[30px] sm:px-[30px]">
            <FormError message={errors.root?.server?.message} />
            <div className="flex flex-col gap-2">
              <p id="photos-label" className="text-sm leading-[normal] font-medium text-text-strong">
                Photos
              </p>
              <PhotoPicker items={photos} onChange={setPhotos} labelledBy="photos-label" />
            </div>

            <Row>
              <FieldBlock id="name" label="Product name" error={errors.name?.message}>
                <input
                  id="name"
                  placeholder="e.g. Front head bushing for KHB-1550"
                  maxLength={120}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={describedBy("name", errors.name?.message)}
                  className={inputClass}
                  {...register("name")}
                />
              </FieldBlock>
              <FieldBlock id="partNumber" label="Part number" optional error={errors.partNumber?.message}>
                <input
                  id="partNumber"
                  placeholder="e.g. 15-FB-02"
                  maxLength={40}
                  autoComplete="off"
                  aria-invalid={errors.partNumber ? true : undefined}
                  aria-describedby={describedBy("partNumber", errors.partNumber?.message)}
                  className={inputClass}
                  {...register("partNumber")}
                />
              </FieldBlock>
            </Row>

            <Row>
              <FieldBlock id="categoryId" label="Category" error={errors.categoryId?.message}>
                <Select id="categoryId" invalid={Boolean(errors.categoryId)} error={errors.categoryId?.message} {...register("categoryId")}>
                  <option value="" disabled>
                    {categories.isPending ? "Loading categories…" : "Select a category"}
                  </option>
                  {(categories.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </FieldBlock>
              <FieldBlock id="condition" label="Condition">
                <Select id="condition" {...register("condition")}>
                  {productConditionSchema.options.map((value) => (
                    <option key={value} value={value}>
                      {CONDITION_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </FieldBlock>
            </Row>

            <Row>
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <FieldBlock id="price" label="Price (OMR)" error={priceOnRequest ? undefined : errors.price?.message}>
                  <input
                    id="price"
                    inputMode="decimal"
                    placeholder={priceOnRequest ? "Price on request" : "e.g. 120.000"}
                    disabled={priceOnRequest}
                    autoComplete="off"
                    aria-invalid={!priceOnRequest && errors.price ? true : undefined}
                    aria-describedby={describedBy("price", priceOnRequest ? undefined : errors.price?.message)}
                    className={inputClass}
                    {...register("price")}
                  />
                </FieldBlock>
                <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[15px] leading-[normal] text-text-strong">
                  <input type="checkbox" className={cn("size-[18px] rounded-[5px] accent-side-accent", focusRing)} {...register("priceOnRequest")} />
                  Price on request
                </label>
              </div>
              <FieldBlock id="stock" label="Quantity in stock" optional error={errors.stock?.message}>
                <input
                  id="stock"
                  inputMode="numeric"
                  placeholder="e.g. 10"
                  maxLength={7}
                  autoComplete="off"
                  aria-invalid={errors.stock ? true : undefined}
                  aria-describedby={describedBy("stock", errors.stock?.message)}
                  className={inputClass}
                  {...register("stock")}
                />
              </FieldBlock>
            </Row>

            <FieldBlock id="description" label="Description" optional error={errors.description?.message}>
              <textarea
                id="description"
                rows={4}
                maxLength={2000}
                placeholder="Size, material, compatible machines and anything buyers should know."
                aria-invalid={errors.description ? true : undefined}
                aria-describedby={describedBy("description", errors.description?.message)}
                className={cn(inputClass, "h-[120px] resize-y py-3.5")}
                {...register("description")}
              />
            </FieldBlock>
          </section>

          <section aria-labelledby="search-details" className="flex flex-col gap-5 rounded-[24px] bg-panel px-5 pt-7 pb-[30px] sm:px-[30px]">
            <div className="flex flex-col gap-1 leading-[normal]">
              <h2 id="search-details" className="text-xl font-medium text-text-strong">
                Details buyers search by
              </h2>
              <p className="text-sm text-text-muted">Buyers look for parts by machine and part number. The more you fill in, the more often you are found.</p>
            </div>

            <MachineList fitments={fitments} onChange={setFitments} />

            <ChipList
              label="Other part numbers"
              hint="OEM or cross-reference numbers, e.g. 6020/F4"
              addLabel="+ Add part number"
              values={extraPartNumbers}
              max={PRODUCT_LIMITS.partNumbers - 1}
              onChange={setExtraPartNumbers}
              isDuplicate={(value, all) => all.some((item) => normalizePartNumber(item) === normalizePartNumber(value))}
            />

            <Row>
              <FieldBlock id="brand" label="Brand" optional error={errors.brand?.message}>
                <input id="brand" placeholder="e.g. Bosch, CAT, Komatsu" maxLength={60} className={inputClass} {...register("brand")} />
              </FieldBlock>
              <FieldBlock id="partSource" label="Genuine or aftermarket" optional>
                <Select id="partSource" {...register("partSource")}>
                  <option value="">Not specified</option>
                  <option value="genuine">{PART_SOURCE_LABELS.genuine}</option>
                  <option value="aftermarket">{PART_SOURCE_LABELS.aftermarket}</option>
                </Select>
              </FieldBlock>
            </Row>

            <Row>
              <FieldBlock id="unit" label="Sold per" hint="Price and quantity are per this unit">
                <Select id="unit" {...register("unit")}>
                  {productUnitSchema.options.map((value) => (
                    <option key={value} value={value}>
                      {UNIT_LABELS[value].one[0]!.toUpperCase() + UNIT_LABELS[value].one.slice(1)}
                    </option>
                  ))}
                </Select>
              </FieldBlock>
              <div className="flex min-w-0 flex-1 flex-col gap-[18px] sm:flex-row">
                <FieldBlock id="availability" label="Availability">
                  <Select id="availability" {...register("availability")}>
                    <option value="in_stock">In stock</option>
                    <option value="on_order">On order</option>
                  </Select>
                </FieldBlock>
                {availability === "on_order" ? (
                  <FieldBlock id="leadTimeDays" label="Ready in (days)" error={errors.leadTimeDays?.message}>
                    <input
                      id="leadTimeDays"
                      inputMode="numeric"
                      placeholder="e.g. 5"
                      maxLength={3}
                      aria-invalid={errors.leadTimeDays ? true : undefined}
                      aria-describedby={describedBy("leadTimeDays", errors.leadTimeDays?.message)}
                      className={inputClass}
                      {...register("leadTimeDays")}
                    />
                  </FieldBlock>
                ) : null}
              </div>
            </Row>
            <FormError message={listError} />
          </section>
        </fieldset>
      </form>
    </>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-[18px] sm:flex-row sm:items-start">{children}</div>;
}

function Select({
  id,
  invalid,
  error,
  children,
  ...rest
}: { id: string; invalid?: boolean; error?: string; children: ReactNode } & React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        id={id}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy(id, error)}
        className={cn(inputClass, "appearance-none pr-11")}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-[18px] -translate-y-1/2 text-text-muted" />
    </div>
  );
}

/** Status of an existing product, with the allowed next steps (the API enforces them again). */
function StatusBar({
  product,
  verified,
  busy,
  onAction,
  error,
}: {
  product: Product;
  verified: boolean;
  busy: boolean;
  onAction: (action: ProductStatusAction) => void;
  error?: string;
}) {
  const live = product.status === "published";
  return (
    <section aria-label="Product status" className="flex flex-col gap-3 rounded-[16px] bg-panel px-5 py-4 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-sm leading-normal text-text-body">
        {live
          ? "This product is live: buyers can find it. Changes you save go live at once."
          : verified
            ? "This product is a draft: only you can see it."
            : "This product is a draft. Only verified sellers can publish."}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {live ? (
          <SmallButton onClick={() => onAction("unpublish")} disabled={busy}>
            Unpublish
          </SmallButton>
        ) : (
          <SmallButton onClick={() => onAction("publish")} disabled={busy || !verified} primary>
            Publish
          </SmallButton>
        )}
        <SmallButton onClick={() => onAction("archive")} disabled={busy}>
          Archive
        </SmallButton>
      </div>
    </section>
  );
}

function SmallButton({ children, primary, ...rest }: { children: ReactNode; primary?: boolean } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "h-10 rounded-full px-5 text-sm font-semibold whitespace-nowrap disabled:opacity-50",
        primary ? "bg-side-accent text-white hover:opacity-90" : "border border-line text-text-strong hover:bg-black/4",
        focusRing,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** "Fits machines": rows of make + model (e.g. Kobelco / SK380). */
function MachineList({ fitments, onChange }: { fitments: Fitment[]; onChange: (next: Fitment[]) => void }) {
  const set = (index: number, field: keyof Fitment, value: string) =>
    onChange(fitments.map((fit, i) => (i === index ? { ...fit, [field]: value } : fit)));
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5 leading-[normal]">
        <p className="text-sm font-medium text-text-strong">Fits machines</p>
        <p className="text-[13px] text-text-muted">Make and model, e.g. Kobelco SK380, Doosan DX300, Hitachi ZW310</p>
      </div>
      {fitments.map((fit, index) => (
        <div key={index} className="flex items-center gap-2.5">
          <input
            aria-label={`Machine ${index + 1} make`}
            placeholder="Make"
            maxLength={40}
            value={fit.make}
            onChange={(event) => set(index, "make", event.target.value)}
            className={cn(inputClass, "flex-1")}
          />
          <input
            aria-label={`Machine ${index + 1} model`}
            placeholder="Model"
            maxLength={60}
            value={fit.model}
            onChange={(event) => set(index, "model", event.target.value)}
            className={cn(inputClass, "flex-1")}
          />
          <button
            type="button"
            aria-label={`Remove machine ${index + 1}`}
            onClick={() => onChange(fitments.filter((_, i) => i !== index))}
            className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-black/4 hover:text-text-strong", focusRing)}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
      {fitments.length < PRODUCT_LIMITS.fitments ? (
        <button
          type="button"
          onClick={() => onChange([...fitments, { make: "", model: "" }])}
          className={cn(
            "w-fit rounded-full border border-dashed border-line px-3.5 py-[7px] text-[13px] leading-[normal] font-medium text-text-muted hover:text-text-strong",
            focusRing,
          )}
        >
          + Add machine
        </button>
      ) : null}
    </div>
  );
}

/** Chips with an inline "+ Add" input, the same style as "Brands you carry" on the company profile. */
function ChipList({
  label,
  hint,
  addLabel,
  values,
  max,
  onChange,
  isDuplicate,
}: {
  label: string;
  hint: string;
  addLabel: string;
  values: string[];
  max: number;
  onChange: (next: string[]) => void;
  isDuplicate: (value: string, all: string[]) => boolean;
}) {
  const inputId = useId();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    if (value && !isDuplicate(value, values) && values.length < max) onChange([...values, value]);
    setDraft("");
    setAdding(false);
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
      <div className="flex flex-col gap-0.5 leading-[normal]">
        <p className="text-sm font-medium text-text-strong" id={`${inputId}-label`}>
          {label} <span className="text-[13px] font-normal text-text-subtle">Optional</span>
        </p>
        <p className="text-[13px] text-text-muted">{hint}</p>
      </div>
      <ul aria-labelledby={`${inputId}-label`} className="flex flex-wrap gap-2">
        {values.map((value) => (
          <li key={value} className="flex items-center gap-1 rounded-full bg-surface py-[7px] pr-2 pl-3.5 text-[13px] leading-[normal] font-medium text-text-strong">
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((item) => item !== value))}
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
              aria-label={label}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              onBlur={commit}
              className={cn("h-[31px] w-40 rounded-full border border-line px-3.5 text-[13px] text-text-strong", focusRing)}
            />
          ) : values.length < max ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={cn(
                "rounded-full border border-dashed border-line px-3.5 py-[7px] text-[13px] leading-[normal] font-medium text-text-muted hover:text-text-strong",
                focusRing,
              )}
            >
              {addLabel}
            </button>
          ) : null}
        </li>
      </ul>
    </div>
  );
}
