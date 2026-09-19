import { describe, expect, it } from "vitest";
import {
  compactPreselectFromParsed,
  compactViewGraphqlId,
  compactViewPreselectAsset,
  compactViewTypename,
  keepGraphqlNodesDespiteErrors,
} from "./preselect";

describe("compactViewGraphqlId", () => {
  it("matches Compact View’s Asset_id encoding", () => {
    expect(compactViewGraphqlId("119C4B1D-4B7F-4870-9B66A1D4B2298427")).toBe(
      "KEFzc2V0X2lkIDExOUM0QjFELTRCN0YtNDg3MC05QjY2QTFENEIyMjk4NDI3KQ=="
    );
  });
});

describe("compactViewTypename", () => {
  it("maps Bynder types to GraphQL __typename", () => {
    expect(compactViewTypename("IMAGE")).toBe("Image");
    expect(compactViewTypename("VIDEO")).toBe("Video");
    expect(compactViewTypename()).toBe("Image");
  });
});

describe("compactViewPreselectAsset", () => {
  it("puts the GraphQL id on id and the media UUID on databaseId", () => {
    const asset = compactViewPreselectAsset({
      mediaId: "119C4B1D-4B7F-4870-9B66A1D4B2298427",
      name: "Earth.jpg",
      thumbnail: "https://cdn.example/earth.jpg",
      type: "IMAGE",
    });
    expect(asset.__typename).toBe("Image");
    expect(asset.databaseId).toBe("119C4B1D-4B7F-4870-9B66A1D4B2298427");
    expect(asset.id).toBe("KEFzc2V0X2lkIDExOUM0QjFELTRCN0YtNDg3MC05QjY2QTFENEIyMjk4NDI3KQ==");
    expect(asset.derivatives.thumbnail).toBe("https://cdn.example/earth.jpg");
  });
});

describe("compactPreselectFromParsed", () => {
  it("dedupes by media UUID", () => {
    expect(
      compactPreselectFromParsed([
        {
          id: "119C4B1D-4B7F-4870-9B66A1D4B2298427",
          name: "Earth.jpg",
          sourceUrl: "https://cdn.example/earth.jpg",
          type: "IMAGE",
        },
        {
          id: "119C4B1D-4B7F-4870-9B66A1D4B2298427",
          name: "Earth copy",
          sourceUrl: "https://cdn.example/earth.jpg",
        },
      ])
    ).toEqual([
      {
        mediaId: "119C4B1D-4B7F-4870-9B66A1D4B2298427",
        name: "Earth.jpg",
        thumbnail: "https://cdn.example/earth.jpg",
        type: "IMAGE",
      },
    ]);
  });
});

describe("keepGraphqlNodesDespiteErrors", () => {
  it("drops errors when nodes already contain an asset", () => {
    expect(
      keepGraphqlNodesDespiteErrors({
        errors: [{ message: "Cannot query field label on Metaproperty" }],
        data: { nodes: [{ __typename: "Image", id: "abc" }] },
      })
    ).toEqual({
      data: { nodes: [{ __typename: "Image", id: "abc" }] },
    });
  });

  it("leaves search errors alone", () => {
    const payload = {
      errors: [{ message: "nope" }],
      data: { searchAssets: { assets: { nodes: [{ id: "x" }] } } },
    };
    expect(keepGraphqlNodesDespiteErrors(payload)).toEqual(payload);
  });

  it("leaves a nodes miss with errors alone", () => {
    const payload = { errors: [{ message: "nope" }], data: { nodes: [] } };
    expect(keepGraphqlNodesDespiteErrors(payload)).toEqual(payload);
  });
});
