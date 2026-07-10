/**
 * Activity → state naming: an inferred state should read as a condition
 * ("Shipped"), not a command ("Ship") — the leading verb becomes a past
 * participle, with common irregulars and doubling handled.
 */
import { describe, it, expect } from "vitest";
import { pastParticiple, activityToState } from "@/app/lib/mining/stateNaming";

describe("state naming (T0691)", () => {
  it("past-participles regular verbs (incl. doubling + e/y rules)", () => {
    expect(pastParticiple("Ship")).toBe("Shipped");        // one-syllable CVC → double
    expect(pastParticiple("Cancel")).toBe("Cancelled");    // trailing l → double (British)
    expect(pastParticiple("Submit")).toBe("Submitted");    // stressed -mit → double
    expect(pastParticiple("Open")).toBe("Opened");         // multi-syllable → NO double
    expect(pastParticiple("Deliver")).toBe("Delivered");   // multi-syllable → NO double
    expect(pastParticiple("Approve")).toBe("Approved");    // e → d
    expect(pastParticiple("Initialise")).toBe("Initialised");
    expect(pastParticiple("Close")).toBe("Closed");
    expect(pastParticiple("Verify")).toBe("Verified");     // consonant+y → ied
  });

  it("uses the irregular table", () => {
    expect(pastParticiple("Pay")).toBe("Paid");
    expect(pastParticiple("Send")).toBe("Sent");
    expect(pastParticiple("Make")).toBe("Made");
    expect(pastParticiple("Pick")).toBe("Picked");
  });

  it("leaves already-inflected words alone (past -ed / gerund -ing)", () => {
    expect(pastParticiple("Shipped")).toBe("Shipped");
    expect(pastParticiple("Closing")).toBe("Closing");
    expect(pastParticiple("Approved")).toBe("Approved");
  });

  it("activityToState past-participles the leading verb, keeps the rest, Capitalised", () => {
    expect(activityToState("place order")).toBe("Placed order");
    expect(activityToState("Ship Order")).toBe("Shipped Order");
    expect(activityToState("pay invoice")).toBe("Paid invoice");
    expect(activityToState("Cancel")).toBe("Cancelled");
  });
});
