import { describe, expect, test } from "bun:test";

import { countryFromNumber, countryFromRange, maskNumber, serviceLabel } from "../src/domain/labels.ts";
import { detectLanguage, extractOtp } from "../src/domain/otp.ts";

describe("maskNumber", () => {
  test("keeps prefix and last four digits", () => {
    expect(maskNumber("6281255512345")).toBe("6281•••••2345");
    expect(maskNumber("+94702999001")).toBe("9470•••9001");
    expect(maskNumber("1234")).toBe("1234•••");
  });
});

describe("labels", () => {
  test("detects service and country", () => {
    expect(serviceLabel("WhatsApp")).toBe("WA");
    expect(serviceLabel("Google")).toBe("GOOGLE");
    expect(serviceLabel("CustomSender")).toBe("CUSTOMSENDER");
    expect(countryFromNumber("6281255512345")).toBe("ID");
  });

  test("maps any country name to its ISO code, not only Indonesia", () => {
    expect(countryFromRange("Bolivia Entel", "")).toBe("BO");
    expect(countryFromRange("Brazil Vivo", "")).toBe("BR");
    expect(countryFromRange("United Arab Emirates Etisalat", "")).toBe("AE");
    expect(countryFromRange("South Africa Vodacom", "")).toBe("ZA");
    expect(countryFromRange("Greece Vodafone", "")).toBe("GR");
    expect(countryFromRange("Sweden Telia", "")).toBe("SE");
    expect(countryFromRange("Unknown Land", "")).toBe("");
  });

  test("the country name wins over the numeric prefix of the number", () => {
    expect(countryFromNumber("59171234567")).toBe("BO");
    expect(countryFromNumber("5511987654321")).toBe("BR");
    expect(countryFromNumber("380501234567")).toBe("UA");
    expect(countryFromNumber("971501234567")).toBe("AE");
    expect(countryFromNumber("27601234567")).toBe("ZA");
    expect(countryFromNumber("447700900123")).toBe("GB");
  });
});

describe("detectLanguage", () => {
  test("detects indonesian and english", () => {
    expect(detectLanguage("Kode verifikasi Anda adalah 123456. Jangan dibagikan.")).toBe("ID");
    expect(detectLanguage("Your verification code is 123456. Do not share.")).toBe("EN");
  });
});

describe("extractOtp", () => {
  test("prefers labeled codes", () => {
    expect(extractOtp("G-204815 is your Google verification code.")).toBe("204815");
    expect(extractOtp("Kode OTP kamu: 9876")).toBe("9876");
    expect(extractOtp("Your account email has been changed.")).toBeNull();
  });

  test("joins hyphenated codes behind an indonesian label", () => {
    expect(extractOtp("Kode verifikasi Anda adalah 2438-2574. Jangan dibagikan.")).toBe("24382574");
    expect(extractOtp("Kode verifikasi Anda adalah 123456. Jangan dibagikan.")).toBe("123456");
  });

  test("joins hyphenated codes behind an english label", () => {
    expect(extractOtp("Your WhatsApp code is 947-2999. Do not share it.")).toBe("9472999");
  });

  test("handles codes split by a space", () => {
    expect(extractOtp("482 913 is your Facebook code. Don't share this code.")).toBe("482913");
    expect(extractOtp("482 913 adalah kode Facebook Anda.")).toBe("482913");
    expect(extractOtp("Kode kamu 123 456")).toBe("123456");
    expect(extractOtp("Your code: 1234 5678")).toBe("12345678");
  });

  test("handles en dash separators", () => {
    expect(extractOtp("Kode kamu 947–2999")).toBe("9472999");
  });

  test("extracts codes across real service templates", () => {
    const templates: Array<[text: string, expected: string]> = [
      ["Your WhatsApp code: 947-2999. Don't share this code.", "9472999"],
      ["Kode WhatsApp Anda: 947-2999. Jangan bagikan kode ini.", "9472999"],
      ["Login code: 51829. Do not give this code to anyone!", "51829"],
      ["123456 is your Instagram code. Don't share it.", "123456"],
      ["Use 4821 to verify your account. Never share this code.", "4821"],
      ["[TikTok] 546281 is your verification code.", "546281"],
      ["Kode OTP Shopee kamu adalah 583920. JANGAN bagikan.", "583920"],
      ["Kode verifikasi Gojek Anda 729104. Jangan bagikan.", "729104"],
      ["Kode verifikasi Tokopedia: 810273. Berlaku 5 menit.", "810273"],
      ["Use code 4718 to sign in to your Microsoft account.", "4718"],
      ["Your Apple ID Code is: 402918. Don't share it.", "402918"],
      ["Your X confirmation code is 801-274. Enter it back.", "801274"],
      ["Your Discord verification code is 674029", "674029"],
      ["PIN Anda 334455. Jangan bagikan.", "334455"],
    ];
    for (const [text, expected] of templates) {
      expect(extractOtp(text)).toBe(expected);
    }
  });

  test("ignores digits that are not a code", () => {
    expect(extractOtp("G-****** is your Google verification code.")).toBeNull();
    expect(extractOtp("Pesanan dikirim 12/10/2026")).toBeNull();
    expect(extractOtp("Hubungi kami di 0812-3456-7890")).toBeNull();
    expect(extractOtp("Sisa stok 15 unit")).toBeNull();
    expect(extractOtp("Total Rp50000 akan dipotong")).toBeNull();
  });
});
