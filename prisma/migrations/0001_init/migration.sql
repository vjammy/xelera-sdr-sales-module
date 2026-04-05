-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('salesperson', 'sales_manager', 'admin_operator');

-- CreateEnum
CREATE TYPE "public"."ListStatus" AS ENUM ('uploaded', 'processing', 'research_in_progress', 'drafts_ready', 'partially_approved', 'fully_approved');

-- CreateEnum
CREATE TYPE "public"."LeadStatus" AS ENUM ('intake_valid', 'research_pending', 'research_complete', 'draft_pending', 'review_ready', 'paused', 'rejected', 'approved');

-- CreateEnum
CREATE TYPE "public"."SequenceStatus" AS ENUM ('draft', 'review_ready', 'approved', 'paused', 'rejected');

-- CreateEnum
CREATE TYPE "public"."RunStatus" AS ENUM ('pending', 'in_progress', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "public"."ImportRowStatus" AS ENUM ('accepted', 'rejected');

-- CreateEnum
CREATE TYPE "public"."ReviewActionType" AS ENUM ('manual_edit', 'regenerate_all', 'regenerate_one', 'approve', 'pause', 'reject', 'bulk_approve');

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Team" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "emailPromptPreference" TEXT,
    "sampleEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "targetPersona" TEXT NOT NULL,
    "problemStatement" TEXT NOT NULL,
    "keyBenefits" JSONB NOT NULL,
    "samplePitch" TEXT NOT NULL,
    "pricingNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadList" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignedSalespersonId" TEXT,
    "uploadedById" TEXT,
    "name" TEXT NOT NULL,
    "eventSourceName" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "eventCity" TEXT,
    "eventCountry" TEXT,
    "notes" TEXT,
    "uploadFileName" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "acceptedRows" INTEGER NOT NULL DEFAULT 0,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."ListStatus" NOT NULL DEFAULT 'uploaded',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadListUpload" (
    "id" TEXT NOT NULL,
    "leadListId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadListUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadImportRow" (
    "id" TEXT NOT NULL,
    "leadListId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" "public"."ImportRowStatus" NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "companyName" TEXT,
    "rawData" JSONB NOT NULL,
    "rejectionReasons" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Company" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "employeeSize" TEXT,
    "geography" TEXT,
    "summary" TEXT,
    "likelyNeeds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Contact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "roleSummary" TEXT,
    "responsibilities" JSONB,
    "buyerAngle" TEXT,
    "personalizationHooks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadListId" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "assignedSalespersonId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "contactNotes" TEXT,
    "status" "public"."LeadStatus" NOT NULL DEFAULT 'intake_valid',
    "companyResearchStatus" "public"."RunStatus" NOT NULL DEFAULT 'pending',
    "contactResearchStatus" "public"."RunStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadNote" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ResearchRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "companyId" TEXT,
    "kind" TEXT NOT NULL,
    "status" "public"."RunStatus" NOT NULL DEFAULT 'pending',
    "summary" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DraftRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "productId" TEXT,
    "status" "public"."RunStatus" NOT NULL DEFAULT 'pending',
    "selectedProductName" TEXT,
    "mainAngle" TEXT,
    "tone" TEXT,
    "painHypothesis" TEXT,
    "suggestedCta" TEXT,
    "messagingBrief" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GenerationPrompt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "draftRunId" TEXT,
    "createdById" TEXT,
    "promptType" TEXT NOT NULL,
    "targetEmail" INTEGER,
    "inputPrompt" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Sequence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "productId" TEXT,
    "draftRunId" TEXT,
    "status" "public"."SequenceStatus" NOT NULL DEFAULT 'draft',
    "selectedProductName" TEXT,
    "valueProposition" TEXT,
    "targetAngle" TEXT,
    "relevantBenefits" JSONB,
    "mainOutreachAngle" TEXT,
    "tone" TEXT,
    "painHypothesis" TEXT,
    "suggestedCta" TEXT,
    "reviewWarnings" JSONB,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SequenceEmail" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "emailOrder" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledSendOffsetHours" INTEGER NOT NULL,
    "editStatus" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReviewAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sequenceId" TEXT,
    "actorId" TEXT NOT NULL,
    "actionType" "public"."ReviewActionType" NOT NULL,
    "prompt" TEXT,
    "targetEmail" INTEGER,
    "note" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BulkApprovalBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "leadIds" JSONB NOT NULL,
    "approvedCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "skippedReasons" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulkApprovalBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "public"."Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Team_organizationId_name_key" ON "public"."Team"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_name_key" ON "public"."Product"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_organizationId_name_key" ON "public"."Company"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Lead_leadListId_status_idx" ON "public"."Lead"("leadListId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Sequence_leadId_key" ON "public"."Sequence"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Sequence_draftRunId_key" ON "public"."Sequence"("draftRunId");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceEmail_sequenceId_emailOrder_key" ON "public"."SequenceEmail"("sequenceId", "emailOrder");

-- AddForeignKey
ALTER TABLE "public"."Team" ADD CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadList" ADD CONSTRAINT "LeadList_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadList" ADD CONSTRAINT "LeadList_assignedSalespersonId_fkey" FOREIGN KEY ("assignedSalespersonId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadList" ADD CONSTRAINT "LeadList_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadListUpload" ADD CONSTRAINT "LeadListUpload_leadListId_fkey" FOREIGN KEY ("leadListId") REFERENCES "public"."LeadList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadImportRow" ADD CONSTRAINT "LeadImportRow_leadListId_fkey" FOREIGN KEY ("leadListId") REFERENCES "public"."LeadList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Company" ADD CONSTRAINT "Company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_leadListId_fkey" FOREIGN KEY ("leadListId") REFERENCES "public"."LeadList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_assignedSalespersonId_fkey" FOREIGN KEY ("assignedSalespersonId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadNote" ADD CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ResearchRun" ADD CONSTRAINT "ResearchRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ResearchRun" ADD CONSTRAINT "ResearchRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ResearchRun" ADD CONSTRAINT "ResearchRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftRun" ADD CONSTRAINT "DraftRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftRun" ADD CONSTRAINT "DraftRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftRun" ADD CONSTRAINT "DraftRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GenerationPrompt" ADD CONSTRAINT "GenerationPrompt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GenerationPrompt" ADD CONSTRAINT "GenerationPrompt_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GenerationPrompt" ADD CONSTRAINT "GenerationPrompt_draftRunId_fkey" FOREIGN KEY ("draftRunId") REFERENCES "public"."DraftRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GenerationPrompt" ADD CONSTRAINT "GenerationPrompt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sequence" ADD CONSTRAINT "Sequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sequence" ADD CONSTRAINT "Sequence_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sequence" ADD CONSTRAINT "Sequence_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sequence" ADD CONSTRAINT "Sequence_draftRunId_fkey" FOREIGN KEY ("draftRunId") REFERENCES "public"."DraftRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sequence" ADD CONSTRAINT "Sequence_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SequenceEmail" ADD CONSTRAINT "SequenceEmail_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "public"."Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReviewAction" ADD CONSTRAINT "ReviewAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReviewAction" ADD CONSTRAINT "ReviewAction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReviewAction" ADD CONSTRAINT "ReviewAction_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "public"."Sequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReviewAction" ADD CONSTRAINT "ReviewAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BulkApprovalBatch" ADD CONSTRAINT "BulkApprovalBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BulkApprovalBatch" ADD CONSTRAINT "BulkApprovalBatch_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

