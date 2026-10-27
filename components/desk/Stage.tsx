"use client";

/** Every token on one scale: the instrument, with ring coins. */
import type { View } from "@/lib/present";
import { Instrument } from "../reveal/Instrument";
import { RingCoin } from "./RingCoin";
import s from "./Stage.module.css";

const GEOMETRY = { coin: { desktop: 42, mobile: 34 }, zone: { desktop: 104, mobile: 64 } };

export function Stage({ view }: { view: View }) {
  const { reference, zone } = view.instrument;
  return (
    <section className={s.stage} aria-label="Every token on one scale">
      <div className={s.head}>
        <span>{view.instrument.reference.vs}</span>
        <span>±1%</span>
      </div>
      <Instrument
        view={view}
        s={s}
        Coin={RingCoin}
        line={63}
        mobileZoneLift={32}
        geometry={GEOMETRY}
        ariaNoun={view.asset.noun}
        label={
          <>
            {reference.label.toLowerCase()} <b>{reference.price}</b>
          </>
        }
        zone={zone && <span>{zone.label.toLowerCase().replace(/ cheaper$/, "\ncheaper")}</span>}
      />
    </section>
  );
}
