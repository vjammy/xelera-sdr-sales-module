import * as XLSX from "xlsx";

export type ParsedLeadRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  title: string;
  companyName: string;
  contactNotes: string;
  rejected: boolean;
  rejectionReasons: string[];
  rawData: Record<string, string>;
};

const HEADER_ALIASES: Record<string, string[]> = {
  firstName: ["first name", "firstname", "first_name", "given name"],
  lastName: ["last name", "lastname", "last_name", "surname"],
  fullName: ["full name", "name", "contact name"],
  email: ["email", "email address", "work email"],
  phone: ["phone", "mobile", "phone number"],
  title: ["title", "job title", "designation", "role"],
  companyName: ["company", "company name", "account", "organization"],
  contactNotes: ["notes", "contact notes", "lead notes", "event notes"],
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function mapHeaders(headers: string[]) {
  const lookup = Object.fromEntries(headers.map((header) => [normalizeHeader(header), header]));

  return Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([field, aliases]) => {
      const match = aliases.find((alias) => lookup[alias]);
      return [field, match ? lookup[match] : null];
    }),
  ) as Record<keyof Omit<ParsedLeadRow, "rowNumber" | "rejected" | "rejectionReasons" | "rawData">, string | null>;
}

function getCell(row: Record<string, unknown>, key: string | null) {
  if (!key) {
    return "";
  }

  const value = row[key];
  return typeof value === "string" ? value.trim() : value ? String(value).trim() : "";
}

export async function parseLeadFile(file: File) {
  const fileName = file.name.toLowerCase();
  const supported = fileName.endsWith(".csv") || fileName.endsWith(".xlsx");

  if (!supported) {
    throw new Error("Only CSV and XLSX files are supported.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];

  if (!firstSheet) {
    throw new Error("The uploaded file does not contain a readable worksheet.");
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
    defval: "",
  });

  if (!rows.length) {
    throw new Error("The uploaded file does not contain any usable rows.");
  }

  const headers = Object.keys(rows[0]);
  const mappedHeaders = mapHeaders(headers);
  const emailSeen = new Set<string>();

  return rows.map<ParsedLeadRow>((row, index) => {
    const firstName = getCell(row, mappedHeaders.firstName);
    const lastName = getCell(row, mappedHeaders.lastName);
    const suppliedFullName = getCell(row, mappedHeaders.fullName);
    const fullName = suppliedFullName || [firstName, lastName].filter(Boolean).join(" ");
    const email = getCell(row, mappedHeaders.email).toLowerCase();
    const phone = getCell(row, mappedHeaders.phone);
    const rejectionReasons: string[] = [];

    if (!email && !phone) {
      rejectionReasons.push("Missing both email and phone.");
    }

    if (email) {
      if (emailSeen.has(email)) {
        rejectionReasons.push("Duplicate email appears in the same list.");
      } else {
        emailSeen.add(email);
      }
    }

    if (!fullName && !getCell(row, mappedHeaders.companyName)) {
      rejectionReasons.push("Missing key identity fields for the row.");
    }

    return {
      rowNumber: index + 2,
      firstName,
      lastName,
      fullName: fullName || "Unknown Contact",
      email,
      phone,
      title: getCell(row, mappedHeaders.title),
      companyName: getCell(row, mappedHeaders.companyName),
      contactNotes: getCell(row, mappedHeaders.contactNotes),
      rejected: rejectionReasons.length > 0,
      rejectionReasons,
      rawData: Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? value : String(value ?? "")]),
      ),
    };
  });
}
