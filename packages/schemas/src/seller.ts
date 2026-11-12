import { z } from "zod";
import { fileLinkSchema } from "./upload";

/**
 * Seller company profile and verification. There is one seller type
 * (manufacturers, distributors and suppliers are all sellers).
 */

/** Sellers must be based in a GCC country. */
export const gccCountrySchema = z.enum(["OM", "AE", "SA", "QA", "KW", "BH"]);
export type GccCountry = z.infer<typeof gccCountrySchema>;

export const GCC_COUNTRY_NAMES: Record<GccCountry, string> = {
  OM: "Oman",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  QA: "Qatar",
  KW: "Kuwait",
  BH: "Bahrain",
};

/** Plain single-line text: no control characters (they break emails, logs and layouts). */
const line = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .regex(/^[^\p{Cc}]*$/u, "Use plain text only");

/** Multi-line text: newlines allowed, other control characters not. */
const paragraph = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^(?:[^\p{Cc}]|\r|\n)*$/u, "Use plain text only");

/** International format, e.g. +968 9123 4567 (spaces allowed, stored without). */
const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\+[1-9]\d{6,14}$/, "Use the international format, e.g. +968 9123 4567"));

/** Optional website. Only http(s), so a link can never run script. */
const websiteSchema = z
  .string()
  .trim()
  .max(200)
  .transform((value) => (value === "" ? null : /^https?:\/\//i.test(value) ? value : `https://${value}`))
  .pipe(
    z
      .string()
      .url("Enter a valid website, e.g. alnoorparts.om")
      .refine((value) => /^https?:\/\/[^/\s]+\.[^/\s]+/i.test(value), "Enter a valid website, e.g. alnoorparts.om")
      .nullable(),
  );

export const sellerProfileInputSchema = z.object({
  companyName: line(2, 120),
  country: gccCountrySchema,
  city: line(2, 80),
  phone: phoneSchema,
  website: websiteSchema.nullable().optional().transform((value) => value ?? null),
  about: paragraph(1000).default(""),
  brands: z.array(line(1, 40)).max(20, "Up to 20 brands").default([]),
  /** Decides whether a VAT certificate is required. */
  vatRegistered: z.boolean(),
  /** An upload with purpose seller_logo. Omit to keep the current logo; null removes it. */
  logoUploadId: z.string().uuid().nullable().optional(),
  /** An upload with purpose seller_cover. Omit to keep; null removes it. */
  coverUploadId: z.string().uuid().nullable().optional(),
});
export type SellerProfileInput = z.input<typeof sellerProfileInputSchema>;
export type SellerProfileData = z.output<typeof sellerProfileInputSchema>;

export const verificationStatusSchema = z.enum(["draft", "pending", "approved", "rejected"]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const documentTypeSchema = z.enum(["commercial_registration", "vat_certificate", "owner_id", "bank_proof"]);
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  commercial_registration: "Commercial registration",
  vat_certificate: "VAT certificate",
  owner_id: "Owner national ID",
  bank_proof: "Bank account proof",
};

export const documentStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

/** PUT /v1/seller/documents/:type */
export const submitDocumentSchema = z.object({
  /** An upload with purpose seller_document. */
  uploadId: z.string().uuid(),
  /** CR number, VAT number, ID number or bank name and last digits. */
  documentNumber: line(1, 64).nullable().optional().transform((value) => value ?? null),
});
export type SubmitDocumentInput = z.input<typeof submitDocumentSchema>;

export const sellerDocumentSchema = z.object({
  id: z.string().uuid(),
  type: documentTypeSchema,
  status: documentStatusSchema,
  documentNumber: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  uploadedAt: z.string(),
});
export type SellerDocument = z.infer<typeof sellerDocumentSchema>;

export const sellerProfileSchema = z.object({
  companyName: z.string(),
  country: gccCountrySchema,
  city: z.string(),
  phone: z.string(),
  website: z.string().nullable(),
  about: z.string(),
  brands: z.array(z.string()),
  vatRegistered: z.boolean(),
  logo: fileLinkSchema.nullable(),
  cover: fileLinkSchema.nullable(),
  updatedAt: z.string(),
});
export type SellerProfile = z.infer<typeof sellerProfileSchema>;

export const verificationSchema = z.object({
  status: verificationStatusSchema,
  /** Why the last review rejected the seller, if it did. */
  rejectionReason: z.string().nullable(),
  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  /** Documents this seller must provide (VAT only when VAT-registered). */
  requiredDocuments: z.array(documentTypeSchema),
  /** Required documents not uploaded yet. */
  missingDocuments: z.array(documentTypeSchema),
  /** True when the profile and documents are complete and the status allows submitting. */
  canSubmit: z.boolean(),
});
export type Verification = z.infer<typeof verificationSchema>;

/** GET /v1/seller/profile and the result of every seller write. */
export const sellerAccountSchema = z.object({
  profile: sellerProfileSchema.nullable(),
  documents: z.array(sellerDocumentSchema),
  verification: verificationSchema,
});
export type SellerAccount = z.infer<typeof sellerAccountSchema>;
