"use client";

import clsx from "clsx";
import { Coins, Download, Flame, Gauge, Gift, Plus, Scale, Sparkles, Trash2, Trophy, type LucideIcon, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { MetaLabel, PagePanel, PageSection, PanelTag, RouteFallback, SectionHeading, SupportingText } from "@/components/ui/PagePrimitives";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiDownload, apiRequest, errorMessage } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { trackProductEvent } from "@/lib/productEvents";
import type {
  CoinHistoryItem,
  CustomReward,
  CustomRewardRedemption,
  RewardEconomyContext,
  RewardSummary,
  XpHistoryItem
} from "@/types/reward";

const emptySummary: RewardSummary = {
  level: 1,
  totalXp: 0,
  coins: 0,
  currentStreak: 0,
  longestStreak: 0,
  totalXpEarned: 0,
  totalCoinsEarned: 0,
  totalCoinsSpent: 0
};

const emptyEconomy: RewardEconomyContext = {
  xpMultiplier: 1,
  coinMultiplier: 1,
  inflationRate: 0,
  dailyCoinLimit: 500,
  maxQuestReward: 1000,
  coinsEarnedToday: 0,
  remainingDailyCoins: 500,
  updatedAt: ""
};

const ledgerDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const shortDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric"
});

function formatDate(timestamp: string) {
  return ledgerDate.format(new Date(timestamp));
}

function prettify(label: string) {
  return label
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function historyDay(timestamp: string) {
  return shortDate.format(new Date(timestamp));
}

const coinSpendTypes = new Set(["SPENT", "PENALTY"]);
const ledgerMessageClass = {
  paper: "rounded-md bg-paper px-3 py-2 text-sm text-ink/55",
  white: "rounded-md bg-white px-3 py-2 text-sm text-ink/55"
};

type XpTrendPoint = Pick<XpHistoryItem, "amount" | "id" | "reason"> & { day: string };
type CoinTrendPoint = Pick<CoinHistoryItem, "amount" | "id" | "reason" | "type"> & { day: string };
type CoinFlowSlice = { fill: string; name: string; percent: number; value: number };

function markRewardInactive(rewards: CustomReward[], rewardId: string) {
  return rewards.map((reward) => (reward.id === rewardId ? { ...reward, active: false } : reward));
}

export default function RewardsPage() {
  const { accessToken } = useRequireAuth();
  const [summary, setSummary] = useState<RewardSummary>(emptySummary);
  const [economy, setEconomy] = useState<RewardEconomyContext>(emptyEconomy);
  const [xpHistory, setXpHistory] = useState<XpHistoryItem[]>([]);
  const [coinHistory, setCoinHistory] = useState<CoinHistoryItem[]>([]);
  const [personalRewards, setPersonalRewards] = useState<CustomReward[]>([]);
  const [redemptions, setRedemptions] = useState<CustomRewardRedemption[]>([]);
  const [rewardTitle, setRewardTitle] = useState("");
  const [rewardDescription, setRewardDescription] = useState("");
  const [coinCost, setCoinCost] = useState(50);
  const [creatingReward, setCreatingReward] = useState(false);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const xpTrend = useMemo(() => {
    return xpHistory
      .slice(0, 10)
      .reverse()
      .map((xpEntry) => ({
        id: xpEntry.id,
        day: historyDay(xpEntry.createdAt),
        amount: xpEntry.amount,
        reason: xpEntry.reason
      }));
  }, [xpHistory]);

  const coinTrend = useMemo(() => {
    return coinHistory
      .slice(0, 10)
      .reverse()
      .map((coinEntry) => {
        const signedAmount = coinSpendTypes.has(coinEntry.type) ? -Math.abs(coinEntry.amount) : Math.abs(coinEntry.amount);

        return {
          id: coinEntry.id,
          day: historyDay(coinEntry.createdAt),
          amount: signedAmount,
          type: coinEntry.type,
          reason: coinEntry.reason
        };
      });
  }, [coinHistory]);

  const coinFlow = useMemo(() => {
    const movement = summary.totalCoinsEarned + Math.abs(summary.totalCoinsSpent);
    const earnedPercent = movement > 0 ? Math.round((summary.totalCoinsEarned / movement) * 100) : 0;
    const spentPercent = movement > 0 ? 100 - earnedPercent : 0;

    return [
      { name: "Earned", value: summary.totalCoinsEarned, percent: earnedPercent, fill: "#12a77a" },
      { name: "Spent", value: Math.abs(summary.totalCoinsSpent), percent: spentPercent, fill: "#ed6548" }
    ];
  }, [summary.totalCoinsEarned, summary.totalCoinsSpent]);

  const rewardMix = {
    earnedPercent: coinFlow[0]?.percent ?? 0,
    spentPercent: coinFlow[1]?.percent ?? 0
  };

  const purchases = useMemo(() => {
    return coinHistory.filter((coinEntry) => coinEntry.type === "SPENT" && coinEntry.reason.toLowerCase().startsWith("purchased cosmetic"));
  }, [coinHistory]);

  const dailyUsage =
    economy.dailyCoinLimit <= 0
      ? 100
      : Math.min(100, Math.round((economy.coinsEarnedToday / economy.dailyCoinLimit) * 100));
  const activeRewards = personalRewards.filter((reward) => reward.active);
  const levelProgress = Math.min(100, Math.round(((summary.totalXp % 1000) / 1000) * 100));
  const netCoins = summary.totalCoinsEarned - Math.abs(summary.totalCoinsSpent);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    async function loadRewards() {
      setLoading(true);
      setError(null);

      try {
        const [summaryData, economyData, xpData, coinData, customData, redemptionData] = await Promise.all([
          apiRequest<{ summary: RewardSummary }>("/rewards/summary"),
          apiRequest<{ economy: RewardEconomyContext }>("/rewards/economy-context"),
          apiRequest<{ history: XpHistoryItem[] }>("/rewards/xp-history?limit=50"),
          apiRequest<{ history: CoinHistoryItem[] }>("/rewards/coin-history?limit=50"),
          apiRequest<{ rewards: CustomReward[] }>("/rewards/custom"),
          apiRequest<{ redemptions: CustomRewardRedemption[] }>("/rewards/custom-redemptions")
        ]);

        setSummary(summaryData.summary);
        setEconomy(economyData.economy);
        setXpHistory(xpData.history);
        setCoinHistory(coinData.history);
        setPersonalRewards(customData.rewards);
        setRedemptions(redemptionData.redemptions);
      } catch (err) {
        setError(errorMessage(err, "Could not load rewards"));
      } finally {
        setLoading(false);
      }
    }

    void loadRewards();
  }, [accessToken]);

  async function exportRewardHistory() {
    setExporting(true);
    setError(null);

    try {
      const file = await apiDownload("/rewards/export");
      downloadBlob(file.blob, file.filename);
    } catch (err) {
      setError(errorMessage(err, "Could not export reward history"));
    } finally {
      setExporting(false);
    }
  }

  async function createReward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingReward(true);
    setError(null);
    setNotice(null);

    try {
      const createdReward = await apiRequest<{ reward: CustomReward }>("/rewards/custom", {
        method: "POST",
        body: JSON.stringify({
          title: rewardTitle.trim(),
          description: rewardDescription.trim() || undefined,
          costCoins: coinCost
        })
      });
      setPersonalRewards((rewards) => [createdReward.reward, ...rewards]);
      setRewardTitle("");
      setRewardDescription("");
      setCoinCost(50);
      setNotice("Personal reward added to your vault.");
    } catch (err) {
      setError(errorMessage(err, "Could not create personal reward"));
    } finally {
      setCreatingReward(false);
    }
  }

  async function redeemReward(reward: CustomReward) {
    setRedeemingId(reward.id);
    setError(null);
    setNotice(null);

    try {
      const redemptionResult = await apiRequest<{
        redemption: { balance: number; redeemedAt: string };
      }>(`/rewards/custom/${reward.id}/redeem`, { method: "POST" });
      setSummary((current) => ({ ...current, coins: redemptionResult.redemption.balance }));
      setRedemptions((current) => [
        {
          id: crypto.randomUUID(),
          rewardId: reward.id,
          title: reward.title,
          costCoins: reward.costCoins,
          redeemedAt: redemptionResult.redemption.redeemedAt
        },
        ...current
      ]);
      setNotice(`Redeemed "${reward.title}". Enjoy the reward you earned.`);
      void trackProductEvent("custom_reward_redeemed", { costCoins: reward.costCoins });
    } catch (err) {
      setError(errorMessage(err, "Could not redeem personal reward"));
    } finally {
      setRedeemingId(null);
    }
  }

  async function removeReward(reward: CustomReward) {
    setError(null);
    setNotice(null);

    try {
      await apiRequest(`/rewards/custom/${reward.id}`, { method: "DELETE" });
      setPersonalRewards((rewards) => markRewardInactive(rewards, reward.id));
      setNotice(`"${reward.title}" was removed from the active vault.`);
    } catch (err) {
      setError(errorMessage(err, "Could not remove personal reward"));
    }
  }

  if (!accessToken) {
    return <RouteFallback />;
  }

  return (
    <AppShell eyebrow="Rewards" title="Reward ledger">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      <section className="overflow-hidden rounded-md border border-ink bg-ink text-white shadow-command">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-6 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-bold text-gold">
              <WalletCards size={17} />
              <span>Reward vault</span>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <p className="text-xs font-bold uppercase text-white/45">Available balance</p>
                <p className="mt-1 text-4xl font-bold">{summary.coins} coins</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-white/45">Lifetime XP</p>
                <p className="mt-1 text-2xl font-bold text-violet">{summary.totalXp}</p>
              </div>
            </div>
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs font-bold text-white/45">
                <span>Level {summary.level}</span>
                <span>{summary.totalXp % 1000}/1000 XP</span>
                <span>Level {summary.level + 1}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-md bg-white/10">
                <div
                  aria-label={`${levelProgress}% progress to level ${summary.level + 1}`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={levelProgress}
                  className="lx-progress-fill h-full rounded-md bg-mint"
                  role="progressbar"
                  style={{ width: `${levelProgress}%` }}
                />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <VaultMetric label="XP earned" value={summary.totalXpEarned} />
              <VaultMetric label="Coins earned" value={summary.totalCoinsEarned} />
              <VaultMetric label="Net coin flow" value={netCoins} />
            </div>
          </div>
          <aside className="border-t border-white/10 bg-white/5 p-6 lg:border-l lg:border-t-0">
            <p className="text-xs font-bold uppercase text-white/45">Today&apos;s earning room</p>
            <Gauge className="mt-5 text-mint" size={25} />
            <p className="mt-4 text-3xl font-bold">{economy.remainingDailyCoins}</p>
            <p className="mt-1 text-sm text-white/45">coins remaining before the daily cap</p>
            <div className="mt-5 h-2 overflow-hidden rounded-md bg-white/10">
              <div
                aria-label={`${dailyUsage}% of daily coin limit used`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={dailyUsage}
                className="lx-progress-fill h-full rounded-md bg-gold"
                role="progressbar"
                style={{ width: `${dailyUsage}%` }}
              />
            </div>
            <p className="mt-3 text-xs font-bold text-white/45">{economy.coinsEarnedToday}/{economy.dailyCoinLimit} earned today</p>
          </aside>
        </div>
      </section>

      <section className="mt-6 border-y border-line bg-white py-6 shadow-panel">
        <div className="grid gap-6 px-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:px-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold/10 text-gold">
                <Gift size={20} />
              </span>
              <div>
                <SectionHeading>Personal reward vault</SectionHeading>
                <SupportingText spaced>Give earned coins a real-life purpose.</SupportingText>
              </div>
            </div>

            <form className="mt-5 grid gap-4" onSubmit={createReward}>
              <Input
                label="Reward"
                maxLength={100}
                name="customRewardTitle"
                onChange={(event) => setRewardTitle(event.target.value)}
                placeholder="Coffee break, game night, new book..."
                required
                value={rewardTitle}
              />
              <Input
                label="Why it matters"
                maxLength={300}
                name="customRewardDescription"
                onChange={(event) => setRewardDescription(event.target.value)}
                placeholder="A short reminder for future you"
                value={rewardDescription}
              />
              <Input
                label="Coin cost"
                max={100000}
                min={1}
                name="customRewardCost"
                onChange={(event) => setCoinCost(Number(event.target.value))}
                type="number"
                value={coinCost}
              />
              <Button disabled={creatingReward || rewardTitle.trim().length < 2 || coinCost < 1} type="submit" variant="secondary">
                <Plus size={17} />
                {creatingReward ? "Adding..." : "Add to vault"}
              </Button>
            </form>

            <div className="mt-6 border-t border-line pt-5">
              <h3 className="text-sm font-bold">Recent redemptions</h3>
              <div className="mt-3 grid gap-2">
                {redemptions.slice(0, 4).map((redemption) => (
                  <RedemptionRow key={redemption.id} redemption={redemption} />
                ))}
                {!loading && redemptions.length === 0 && (
                  <p className="text-sm leading-6 text-ink/45">Redemptions appear here after you claim a reward.</p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="font-bold">Available rewards</h3>
                <SupportingText spaced>{summary.coins} coins ready to spend</SupportingText>
              </div>
              <span className="rounded-md bg-gold/10 px-2.5 py-1 text-xs font-bold text-gold">
                {activeRewards.length} active
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {activeRewards.map((reward) => (
                <RewardCard
                  balance={summary.coins}
                  busy={redeemingId === reward.id}
                  key={reward.id}
                  onRedeem={redeemReward}
                  onRemove={removeReward}
                  reward={reward}
                />
              ))}
              {!loading && activeRewards.length === 0 && (
                <div className="rounded-md border border-dashed border-line p-6 text-center">
                  <Gift className="mx-auto text-gold" size={22} />
                  <p className="mt-3 font-bold">Your vault is empty</p>
                  <p className="mt-1 text-sm text-ink/50">Add something small that makes finishing work feel worthwhile.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <PageSection>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <SectionHeading>Economy rules</SectionHeading>
            <SupportingText spaced>These active settings shape quest payouts before they land in the ledger.</SupportingText>
          </div>
          <PanelTag>
            Updated {economy.updatedAt ? formatDate(economy.updatedAt) : "with defaults"}
          </PanelTag>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <EconomyCard>
            <EconomyHeading
               description="Stored difficulty rewards combine with streak and economy settings."
              icon={Scale}
              iconClass="bg-violet/10 text-violet"
              title="Multipliers"
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <EconomyValue label="XP" value={`${economy.xpMultiplier.toFixed(2)}x`} />
              <EconomyValue label="Coins" value={`${economy.coinMultiplier.toFixed(2)}x`} />
            </div>
          </EconomyCard>

          <EconomyCard>
            <EconomyHeading
               description={`Coin issuance is reduced by ${economy.inflationRate.toFixed(0)}% before the daily cap.`}
              icon={Gauge}
              iconClass="bg-mint/10 text-mint"
              title="Daily coin limit"
            />
            <div className="mt-4 flex items-center justify-between text-sm font-semibold text-ink/60">
              <span>{economy.coinsEarnedToday} earned today</span>
              <span>{economy.remainingDailyCoins} left</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-md bg-paper">
              <div
                aria-label={`${dailyUsage}% of daily coin limit used`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={dailyUsage}
                className="h-full rounded-md bg-mint"
                role="progressbar"
                style={{ width: `${dailyUsage}%` }}
              />
            </div>
          </EconomyCard>

          <EconomyCard>
            <EconomyHeading
              description="Single quest payouts cannot exceed the configured cap."
              icon={Trophy}
              iconClass="bg-ember/10 text-ember"
              title="Reward cap"
            />
            <p className="mt-4 rounded-md bg-paper px-3 py-2 text-sm font-semibold text-ink/65">
              Max quest reward: {economy.maxQuestReward} XP or coins before daily coin limits apply.
            </p>
          </EconomyCard>
        </div>
      </PageSection>

      <PageSection>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <SectionHeading>Reward movement</SectionHeading>
            <SupportingText spaced>Recent XP and coin changes from the latest reward ledger rows.</SupportingText>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={exporting || loading || (xpHistory.length === 0 && coinHistory.length === 0)}
            onClick={() => void exportRewardHistory()}
            type="button"
          >
            <Download size={17} />
            {exporting ? "Exporting" : "Export CSV"}
          </button>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <XpMovementChart loading={loading} rowCount={xpHistory.length} trend={xpTrend} />
          <CoinMovementChart loading={loading} rowCount={coinHistory.length} trend={coinTrend} />
        </div>

        <CoinFlowPanel
          earnedCoins={summary.totalCoinsEarned}
          earnedPercent={rewardMix.earnedPercent}
          loading={loading}
          slices={coinFlow}
          spentCoins={Math.abs(summary.totalCoinsSpent)}
          spentPercent={rewardMix.spentPercent}
        />

        <div className="mt-6 rounded-lg border border-ink/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">Cosmetic purchases</h3>
              <SupportingText spaced>Recent shop spending from your coin ledger.</SupportingText>
            </div>
            <PanelTag>
              {purchases.length} purchases
            </PanelTag>
          </div>

          <div className="mt-4 grid gap-2">
            {loading ? (
              <LedgerMessage>Loading purchase history...</LedgerMessage>
            ) : purchases.length === 0 ? (
              <LedgerMessage>No cosmetic purchases yet.</LedgerMessage>
            ) : (
              purchases.slice(0, 5).map((purchase) => (
                <PurchaseRow key={purchase.id} purchase={purchase} />
              ))
            )}
          </div>
        </div>
      </PageSection>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <HistoryPanel
          description="Recent XP changes from completed work."
          icon={Sparkles}
          iconClass="bg-violet/10 text-violet"
          title="XP history"
        >
          {loading ? (
            <LedgerMessage>Loading XP history...</LedgerMessage>
          ) : xpHistory.length === 0 ? (
            <LedgerMessage>No XP transactions yet.</LedgerMessage>
          ) : (
            xpHistory.slice(0, 10).map((xpEntry) => (
              <XpRow key={xpEntry.id} xpEntry={xpEntry} />
            ))
          )}
        </HistoryPanel>

        <HistoryPanel
          description="Recent earned, spent, and adjusted coins."
          icon={Coins}
          iconClass="bg-ember/10 text-ember"
          title="Coin history"
        >
          {loading ? (
            <LedgerMessage>Loading coin history...</LedgerMessage>
          ) : coinHistory.length === 0 ? (
            <LedgerMessage>No coin transactions yet.</LedgerMessage>
          ) : (
            coinHistory.slice(0, 10).map((coinEntry) => <CoinRow coinEntry={coinEntry} key={coinEntry.id} />)
          )}
        </HistoryPanel>
      </section>

      <section className="mt-6 rounded-lg bg-ink p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <SectionHeading>Streak momentum</SectionHeading>
            <p className="mt-1 text-sm text-white/65">Current streak {summary.currentStreak} / best streak {summary.longestStreak}</p>
          </div>
          <Flame className="text-mint" size={28} />
        </div>
      </section>
    </AppShell>
  );
}

function VaultMetric({ label, value: amount }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-white/45">{label}</p>
      <p className={clsx("mt-1 text-xl font-bold", amount < 0 ? "text-ember" : "text-white")}>{amount}</p>
    </div>
  );
}

function LedgerMessage({ children, surface = "paper" }: { children: ReactNode; surface?: keyof typeof ledgerMessageClass }) {
  return <p className={ledgerMessageClass[surface]}>{children}</p>;
}

function EconomyCard({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-ink/10 p-4">{children}</div>;
}

function EconomyHeading({
  description,
  icon: Icon,
  iconClass,
  title
}: {
  description: string;
  icon: LucideIcon;
  iconClass: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={clsx("flex h-10 w-10 items-center justify-center rounded-md", iconClass)}>
        <Icon size={20} />
      </div>
      <div>
        <h3 className="font-bold">{title}</h3>
        <SupportingText>{description}</SupportingText>
      </div>
    </div>
  );
}

function EconomyValue({ label, value: amount }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <MetaLabel>{label}</MetaLabel>
      <p className="mt-1 text-sm font-semibold">{amount}</p>
    </div>
  );
}

function MovementChart({ children, label, rowCount }: { children: ReactNode; label: string; rowCount: number }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink/60">{label}</p>
        <p className="text-sm text-ink/45">{rowCount} rows</p>
      </div>
      <div className="h-72 rounded-lg bg-paper p-3">{children}</div>
    </div>
  );
}

function XpMovementChart({ loading, rowCount, trend }: { loading: boolean; rowCount: number; trend: XpTrendPoint[] }) {
  return (
    <MovementChart label="XP pulses" rowCount={rowCount}>
      {loading ? (
        <LedgerMessage>Loading XP chart...</LedgerMessage>
      ) : trend.length === 0 ? (
        <LedgerMessage>No XP chart data yet.</LedgerMessage>
      ) : (
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={trend} margin={{ bottom: 8, left: 0, right: 12, top: 12 }}>
            <CartesianGrid stroke="#dce5e1" strokeDasharray="4 4" />
            <XAxis dataKey="day" fontSize={12} stroke="#5f6b65" tickLine={false} />
            <YAxis fontSize={12} stroke="#5f6b65" tickLine={false} width={42} />
            <Tooltip
              contentStyle={{ border: "0", borderRadius: "8px", boxShadow: "0 10px 30px rgba(25, 20, 15, 0.12)" }}
              formatter={(amount) => [`+${amount} XP`, "XP"]}
              labelStyle={{ color: "#17201c", fontWeight: 700 }}
            />
            <Line dataKey="amount" dot={{ fill: "#6958e8", r: 4 }} name="XP" stroke="#6958e8" strokeWidth={3} type="monotone" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </MovementChart>
  );
}

function CoinMovementChart({ loading, rowCount, trend }: { loading: boolean; rowCount: number; trend: CoinTrendPoint[] }) {
  return (
    <MovementChart label="Coin movement" rowCount={rowCount}>
      {loading ? (
        <LedgerMessage>Loading coin chart...</LedgerMessage>
      ) : trend.length === 0 ? (
        <LedgerMessage>No coin chart data yet.</LedgerMessage>
      ) : (
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={trend} margin={{ bottom: 8, left: 0, right: 12, top: 12 }}>
            <CartesianGrid stroke="#dce5e1" strokeDasharray="4 4" />
            <XAxis dataKey="day" fontSize={12} stroke="#5f6b65" tickLine={false} />
            <YAxis fontSize={12} stroke="#5f6b65" tickLine={false} width={42} />
            <Tooltip
              contentStyle={{ border: "0", borderRadius: "8px", boxShadow: "0 10px 30px rgba(25, 20, 15, 0.12)" }}
              formatter={(amount) => [`${Number(amount) > 0 ? "+" : ""}${amount} coins`, "Coins"]}
              labelStyle={{ color: "#17201c", fontWeight: 700 }}
            />
            <Bar dataKey="amount" name="Coins" radius={[6, 6, 0, 0]}>
              {trend.map((coinEntry) => (
                <Cell fill={coinEntry.amount >= 0 ? "#12a77a" : "#ed6548"} key={coinEntry.id} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </MovementChart>
  );
}

function CoinFlowPanel({
  earnedCoins,
  earnedPercent,
  loading,
  slices,
  spentCoins,
  spentPercent
}: {
  earnedCoins: number;
  earnedPercent: number;
  loading: boolean;
  slices: CoinFlowSlice[];
  spentCoins: number;
  spentPercent: number;
}) {
  return (
    <div className="mt-6 grid gap-4 rounded-lg bg-paper p-4 md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink/60">Coin flow</p>
          <p className="mt-1 text-sm text-ink/45">
            Earned {earnedPercent}% / spent {spentPercent}%
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <FlowStat amount={earnedCoins} label="earned" tone="text-mint" />
          <FlowStat amount={spentCoins} label="spent" tone="text-ember" />
        </div>
      </div>
      <div className="h-44">
        {loading ? (
          <LedgerMessage surface="white">Loading coin flow...</LedgerMessage>
        ) : earnedCoins + spentCoins === 0 ? (
          <LedgerMessage surface="white">No coin flow data yet.</LedgerMessage>
        ) : (
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie data={slices} dataKey="value" innerRadius={42} nameKey="name" outerRadius={70} paddingAngle={4}>
                {slices.map((slice) => (
                  <Cell fill={slice.fill} key={slice.name} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ border: "0", borderRadius: "8px", boxShadow: "0 10px 30px rgba(25, 20, 15, 0.12)" }}
                formatter={(coins, name) => [`${coins} coins`, name]}
              />
              <Legend iconType="circle" verticalAlign="bottom" />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function FlowStat({ amount, label, tone }: { amount: number; label: string; tone: string }) {
  return (
    <span className={clsx("rounded-md bg-white px-3 py-2 font-semibold", tone)}>
      {amount} {label}
    </span>
  );
}

function HistoryPanel({
  children,
  description,
  icon: Icon,
  iconClass,
  title
}: {
  children: ReactNode;
  description: string;
  icon: LucideIcon;
  iconClass: string;
  title: string;
}) {
  return (
    <PagePanel>
      <div className="flex items-center gap-3">
        <div className={clsx("flex h-10 w-10 items-center justify-center rounded-md", iconClass)}>
          <Icon size={20} />
        </div>
        <div>
          <SectionHeading>{title}</SectionHeading>
          <SupportingText>{description}</SupportingText>
        </div>
      </div>
      <div className="mt-5 space-y-3">{children}</div>
    </PagePanel>
  );
}

function RedemptionRow({ redemption }: { redemption: CustomRewardRedemption }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-paper px-3 py-2">
      <span className="min-w-0 truncate text-sm font-semibold">{redemption.title}</span>
      <span className="shrink-0 text-xs font-bold text-ink/45">
        {redemption.costCoins} coins · {historyDay(redemption.redeemedAt)}
      </span>
    </div>
  );
}

function RewardCard({
  balance,
  busy,
  onRedeem,
  onRemove,
  reward
}: {
  balance: number;
  busy: boolean;
  onRedeem: (reward: CustomReward) => Promise<void>;
  onRemove: (reward: CustomReward) => Promise<void>;
  reward: CustomReward;
}) {
  return (
    <article className="grid gap-4 rounded-md border border-line p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <h4 className="font-bold">{reward.title}</h4>
        <p className="mt-1 text-sm leading-5 text-ink/50">
          {reward.description || "A personal reward waiting to be earned."}
        </p>
        <span className="mt-3 inline-flex items-center gap-1 rounded-md bg-gold/10 px-2 py-1 text-xs font-bold text-gold">
          <Coins size={13} />
          {reward.costCoins}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          disabled={busy || balance < reward.costCoins}
          onClick={() => void onRedeem(reward)}
          type="button"
          variant="secondary"
        >
          {busy ? "Redeeming..." : "Redeem"}
        </Button>
        <button
          aria-label={`Remove ${reward.title}`}
          className="lx-button flex h-11 w-11 items-center justify-center rounded-md border border-line text-ember hover:bg-ember/10"
          onClick={() => void onRemove(reward)}
          title="Remove reward"
          type="button"
        >
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  );
}

function PurchaseRow({ purchase }: { purchase: CoinHistoryItem }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper px-3 py-2">
      <div>
        <p className="text-sm font-semibold">{purchase.reason.replace("Purchased cosmetic: ", "")}</p>
        <p className="mt-1 text-xs text-ink/45">{formatDate(purchase.createdAt)}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-ember">{purchase.amount} coins</p>
        <p className="mt-1 text-xs text-ink/45">Balance {purchase.balanceAfter}</p>
      </div>
    </div>
  );
}

function XpRow({ xpEntry }: { xpEntry: XpHistoryItem }) {
  return (
    <LedgerHistoryRow
      badge={
        <span className="rounded-md bg-violet/10 px-2 py-1 text-sm font-semibold text-violet">
          +{xpEntry.amount} XP
        </span>
      }
      detail={`${prettify(xpEntry.sourceType)} / ${formatDate(xpEntry.createdAt)}`}
      footer={`Multiplier ${xpEntry.multiplier.toFixed(2)}x`}
      reason={xpEntry.reason}
    />
  );
}

function CoinRow({ coinEntry }: { coinEntry: CoinHistoryItem }) {
  const positive = coinEntry.amount >= 0;

  return (
    <LedgerHistoryRow
      badge={
        <span
          className={clsx(
            "rounded-md px-2 py-1 text-sm font-semibold",
            positive ? "bg-mint/10 text-mint" : "bg-ember/10 text-ember"
          )}
        >
          {positive ? "+" : ""}
          {coinEntry.amount} coins
        </span>
      }
      detail={`${prettify(coinEntry.type)} / ${formatDate(coinEntry.createdAt)}`}
      footer={`Balance after ${coinEntry.balanceAfter}`}
      reason={coinEntry.reason}
    />
  );
}

function LedgerHistoryRow({
  badge,
  detail,
  footer,
  reason
}: {
  badge: ReactNode;
  detail: string;
  footer: string;
  reason: string;
}) {
  return (
    <div className="rounded-lg border border-ink/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{reason}</p>
          <SupportingText spaced>{detail}</SupportingText>
        </div>
        {badge}
      </div>
      <p className="mt-3 text-sm text-ink/55">{footer}</p>
    </div>
  );
}
