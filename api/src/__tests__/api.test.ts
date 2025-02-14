import * as http from "http";
import Koa from "koa";
import supertest from "supertest";

import { API_PREFIX, router } from "../routes";

const app = new Koa();
app.use(router.routes());
// .on("error", (err, ctx) => {
// console.error("server error", err, ctx);
// });

const apptest = supertest(http.createServer(app.callback()));

const searchCall = ({
  query,
  address,
  limit,
  open,
  employer,
  convention,
  ranked,
}: {
  query: string;
  address?: string;
  limit?: number;
  open?: string;
  employer?: boolean;
  convention?: boolean;
  ranked?: string;
}) => {
  const addressQP = address ? `&address=${address}` : "";
  const limitQP = limit ? `&limit=${limit}` : "";

  const openQP = open ? `&open=${open}` : "";
  const employerQP = employer ? `&employer=${employer}` : "";

  const rankedQP = ranked ? `&ranked=${ranked}` : "";

  const url = `${API_PREFIX}/search?convention=${
    convention?.toString() || true
  }&query=${query}${addressQP}${limitQP}${openQP}${employerQP}${rankedQP}`;

  // console.log(url);

  return apptest.get(url);
};

const michelinSiren = "855200507";
const michelinSiret = `${michelinSiren}03169`;

describe("Test search", () => {
  test("generic search", async () => {
    const { status, body } = await searchCall({ query: "michelin" });

    expect(status).toBe(200);
    expect(body.entreprises).toBeDefined();
    expect(body.entreprises.length).toEqual(20);
    expect(body.entreprises[0].siren).toEqual(michelinSiren);
    // eslint-disable-next-line no-unused-vars
    const { firstMatchingEtablissement, ...partialBody } = body.entreprises[0];
    expect(partialBody).toMatchSnapshot();
  });

  test("with limit", async () => {
    const limit = 50;
    const { body } = await searchCall({ limit, query: "michelin" });
    expect(body.entreprises.length).toEqual(limit);
  });

  test("search with postal code and city", async () => {
    const { body: b1 } = await searchCall({ query: "michelin" });
    expect(b1.entreprises[0].firstMatchingEtablissement.address).not.toBe(
      `"23 PLACE DES CARMES DECHAUX 63000 CLERMONT-FERRAND"`
    );

    const { body: b2 } = await searchCall({
      address: "63 000",
      query: "michelin",
    });
    expect(
      b2.entreprises[0].firstMatchingEtablissement.address
    ).toMatchInlineSnapshot(
      `"PLACE DES CARMES DECHAUX 63000 CLERMONT-FERRAND"`
    );

    const { body: b3 } = await searchCall({
      address: "clermont",
      query: "michelin",
    });
    expect(
      b3.entreprises[0].firstMatchingEtablissement.address
    ).toMatchInlineSnapshot(
      `"PLACE DES CARMES DECHAUX 63000 CLERMONT-FERRAND"`
    );

    const { body: b4 } = await searchCall({ address: "63", query: "michelin" });
    expect(
      b4.entreprises[0].firstMatchingEtablissement.address
    ).toMatchInlineSnapshot(
      `"PLACE DES CARMES DECHAUX 63000 CLERMONT-FERRAND"`
    );
  }, 15000);

  test("search with diatrics", async () => {
    const { body: b1 } = await searchCall({ query: "michelin" });
    const { body: b2 } = await searchCall({ query: "michélin" });
    const { body: b3 } = await searchCall({ query: "Mîchèlin" });

    expect(b1).toStrictEqual(b2);
    expect(b1).toStrictEqual(b3);
  });

  test("search with siret", async () => {
    const { body } = await searchCall({ query: michelinSiret });
    expect(body.entreprises[0].firstMatchingEtablissement.siret).toEqual(
      michelinSiret
    );
  });

  // test with siret starting with 0
});

describe("Test etablissement search", () => {
  test("correct siret", async () => {
    const { body, status } = await apptest.get(
      `${API_PREFIX}/etablissement/${michelinSiret}`
    );
    expect(status).toEqual(200);
    expect(body.siret).toEqual(michelinSiret);
    expect(body).toMatchSnapshot();
  });

  test("unexisting siret", async () => {
    const { status } = await apptest.get(
      `${API_PREFIX}/etablissement/11111111111111`
    );
    expect(status).toEqual(404);
  });

  test("incorrect siret", async () => {
    const { status } = await apptest.get(
      `${API_PREFIX}/etablissement/${michelinSiret + "123"}`
    );
    expect(status).toEqual(400);
  });

  test("multiple conventions for one etablissement", async () => {
    const manyCCsSiret = "00572078400106";
    const { body } = await apptest.get(
      `${API_PREFIX}/etablissement/${manyCCsSiret}`
    );
    expect(body.conventions.length).toEqual(2);
  });
});

describe("Test entreprise search", () => {
  test("correct siren", async () => {
    const { body, status } = await apptest.get(
      `${API_PREFIX}/entreprise/${michelinSiren}`
    );
    // We delete matching etablissement since it comes from collapse which is non deterministic
    delete body.firstMatchingEtablissement;
    delete body.allMatchingEtablissements;
    expect(status).toEqual(200);
    expect(body.siren).toEqual(michelinSiren);
    expect(body).toMatchSnapshot();
  });

  test("unexisting siret", async () => {
    const { status } = await apptest.get(`${API_PREFIX}/entreprise/111111111`);
    expect(status).toEqual(404);
  });

  test("incorrect siret", async () => {
    const { status } = await apptest.get(
      `${API_PREFIX}/entreprise/${michelinSiren + "123"}`
    );
    expect(status).toEqual(400);
  });
});

describe("Test api params", () => {
  test("not only open", async () => {
    const { body: b1 } = await searchCall({
      open: "false",
      query: "michelin",
      limit: 1,
      convention: false,
    });
    expect(
      b1.entreprises[0].firstMatchingEtablissement
        .etatAdministratifEtablissement
    ).toEqual("F");
  });

  test("not only employer", async () => {
    const getNotEmployer = (resp: any) =>
      resp.entreprises.filter(
        (e: any) => e.caractereEmployeurUniteLegale == "N"
      );

    const { body: notOnlyEmployer } = await searchCall({
      employer: false,
      query: "michelin",
    });
    expect(getNotEmployer(notOnlyEmployer).length).toBeGreaterThan(0);

    const { body: onlyEmployer } = await searchCall({
      employer: true,
      query: "michelin",
    });
    expect(getNotEmployer(onlyEmployer).length).toBe(0);
  });

  test("not with convention", async () => {
    const { body: withConvention } = await searchCall({
      query: "truc",
      limit: 1,
    });
    const { body: noConvention } = await searchCall({
      convention: false,
      query: "truc",
      limit: 1,
    });
    expect(noConvention.entreprises[0].conventions).toEqual([]);
    expect(withConvention.entreprises[0].conventions.length).toBeGreaterThan(0);
  });

  test("unranked search", async () => {
    const {
      body: { entreprises: ranked },
    } = await searchCall({ query: "michelin" });

    const {
      body: { entreprises: unranked },
    } = await searchCall({ query: "michelin", ranked: "false" });

    expect(unranked).not.toStrictEqual(ranked);
    expect(ranked[0].label).toEqual(
      "MANUFACTURE FRANCAISE DES PNEUMATIQUES MICHELIN"
    );
    expect(unranked[0].label).not.toEqual(ranked[0].label);
    expect(unranked[2].label).toEqual("BOULANGERIE MICHELIN");
  });
});
