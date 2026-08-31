import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSnapshot,
  calculateCagr,
  calculateMoneyWeightedReturn,
  detectFileType,
  parseDate,
  parseNumber,
} from "../lib/portfolio";

const portfolio = `Product,Symbool/ISIN,Aantal,Slotkoers,Lokale waarde,,Waarde in EUR
Example NV,NL0000000001,"12,00","110,00",EUR,"1320,00","1320,00"
`;

const account = `Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id
01-01-2025,09:00,01-01-2025,,,iDEAL Deposit,,EUR,"1000,00",EUR,"1000,00",
`;

const transactions = `Datum,Tijd,Product,ISIN,Beurs,Uitvoeringsplaats,Aantal,Koers,,Lokale waarde,,Waarde EUR,Wisselkoers,AutoFX Kosten,Transactiekosten en/of kosten van derden EUR,Totaal EUR,Order ID,
02-01-2025,10:00,Example NV,NL0000000001,EAM,XAMS,"10,00","90,00",EUR,"-900,00","-900,00","-900,00",,"0,00","0,00","-900,00",order-1,
03-01-2025,10:00,Example NV,NL0000000001,EAM,XAMS,"2,00","100,00",EUR,"-200,00","-200,00","-200,00",,"0,00","0,00","-200,00",order-2,
`;

test("parses DEGIRO numbers and dates", () => {
  assert.equal(parseNumber("1.234,56"), 1234.56);
  assert.equal(parseNumber("(42,50)"), -42.5);
  assert.equal(parseDate("31-12-2025"), "2025-12-31");
});

test("detects all three DEGIRO exports", () => {
  assert.equal(detectFileType(portfolio), "portfolio");
  assert.equal(detectFileType(account), "account");
  assert.equal(detectFileType(transactions), "transactions");
});

test("MWRR uses exact cash-flow dates", () => {
  const result = calculateMoneyWeightedReturn([
    ["2021-01-01", -1000],
    ["2022-01-01", 1100],
  ]);
  assert.ok(result !== null);
  assert.ok(Math.abs(result - 0.1) < 1e-8);
  assert.equal(calculateMoneyWeightedReturn([["2021-01-01", -1000], ["2022-01-01", -100]]), null);
});

test("CAGR annualises share-price growth", () => {
  const result = calculateCagr(100, 121, "2021-01-01", "2022-01-01");
  assert.ok(result !== null);
  assert.ok(Math.abs(result - 0.21) < 1e-8);
  assert.equal(calculateCagr(0, 121, "2021-01-01", "2022-01-01"), null);
});

test("builds a private portfolio snapshot from the three exports", () => {
  const snapshot = buildSnapshot({ portfolio, account, transactions }, []);
  assert.equal(snapshot.overview.current_value, 1320);
  assert.equal(snapshot.overview.net_deposits, 1000);
  assert.equal(snapshot.overview.investment_result, 320);
  assert.equal(snapshot.holdings[0].open_cost_eur, 1100);
  assert.equal(snapshot.holdings[0].unrealised_eur, 220);
  assert.equal(snapshot.quality.portfolio_rows, 1);
  assert.equal(snapshot.quality.account_rows, 1);
  assert.equal(snapshot.quality.transaction_rows, 2);
  assert.equal(snapshot.historical_instruments[0].status, "Open");
});
