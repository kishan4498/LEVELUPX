"use client";

import clsx from "clsx";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Coins, Eye, Flame, Gem, Lock, Palette, Pickaxe, Search, ShieldCheck, Sparkles, UserCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { AccountControlPanel } from "@/components/account/AccountControlPanel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { MetaLabel, PagePanel, RouteFallback, SectionHeading, SupportingText } from "@/components/ui/PagePrimitives";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiRequest, errorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { AuthUser } from "@/types/auth";
import type { CharacterClass, CosmeticItem, MarketplaceListing, Skill, UserProfile } from "@/types/profile";

function multiplierLabel(multiplier: number) {
  return `${multiplier.toFixed(2).replace(/\.00$/, "")}x XP`;
}

const rarityStyles: Record<CosmeticItem["rarity"], string> = {
  COMMON: "border-ink/20 bg-paper text-ink",
  RARE: "border-mint/40 bg-mint/10 text-mint",
  EPIC: "border-violet/40 bg-violet/10 text-violet",
  LEGENDARY: "border-ember/50 bg-ember/10 text-ember"
};
const emptyMessageClass = "rounded-md bg-paper px-3 py-2 text-sm text-ink/55";

function rarityClasses(rarity: CosmeticItem["rarity"]) {
  return rarityStyles[rarity];
}

function slotLabel(slot: CosmeticItem["slot"]) {
  return slot === "AVATAR_FRAME" ? "Avatar frame" : "Profile badge";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function markSelectedCosmetic(cosmetics: CosmeticItem[], cosmeticId: string) {
  return cosmetics.map((cosmetic) => ({
    ...cosmetic,
    selected: cosmetic.id === cosmeticId
  }));
}

function markOwnedCosmetic(cosmetics: CosmeticItem[], cosmeticId: string) {
  return cosmetics.map((cosmetic) =>
    cosmetic.id === cosmeticId
      ? {
          ...cosmetic,
          owned: true,
          unlockedAt: new Date().toISOString()
        }
      : cosmetic
  );
}

export default function ProfilePage() {
  const { accessToken, user } = useRequireAuth();
  const setUser = useAuthStore((s) => s.setUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [classes, setClasses] = useState<CharacterClass[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [cosmetics, setCosmetics] = useState<CosmeticItem[]>([]);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingClassId, setSavingClassId] = useState<string | null>(null);
  const [savingCosmeticId, setSavingCosmeticId] = useState<string | null>(null);
  const [savingListingId, setSavingListingId] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [slotFilter, setSlotFilter] = useState<"ALL" | CosmeticItem["slot"]>("ALL");
  const [ownershipFilter, setOwnershipFilter] = useState<"ALL" | "OWNED" | "LOCKED">("ALL");
  const [password, setPassword] = useState("");
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedClass = profile?.selectedCharacterClass ?? null;
  const selectedCosmetic = profile?.selectedCosmetic ?? null;
  const unlockedCount = skills.filter((skill) => skill.unlocked).length;
  const ownedCount = cosmetics.filter((cosmetic) => cosmetic.owned).length;
  const preview = cosmetics.find((cosmetic) => cosmetic.id === previewId) ?? selectedCosmetic;
  const avatarPreview = avatarUrl.trim() || profile?.avatarUrl || "";
  const coinBalance = profile?.coins ?? user?.profile?.coins ?? 0;
  const level = profile?.level ?? user?.profile?.level ?? 1;
  const totalXp = profile?.totalXp ?? user?.profile?.totalXp ?? 0;
  const levelProgress = Math.min(100, Math.round(((totalXp % 1000) / 1000) * 100));
  const filteredCosmetics = cosmetics.filter((cosmetic) => {
    const slotMatches = slotFilter === "ALL" || cosmetic.slot === slotFilter;
    const ownershipMatches =
      ownershipFilter === "ALL" ||
      (ownershipFilter === "OWNED" && cosmetic.owned) ||
      (ownershipFilter === "LOCKED" && !cosmetic.owned);

    return slotMatches && ownershipMatches;
  });
  const cosmeticGroups = {
    AVATAR_FRAME: filteredCosmetics.filter((cosmetic) => cosmetic.slot === "AVATAR_FRAME"),
    PROFILE_BADGE: filteredCosmetics.filter((cosmetic) => cosmetic.slot === "PROFILE_BADGE")
  };
  const initials = getInitials(user?.name ?? "Player");

  const loadProfileData = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [meData, profileData, classesData, skillsData, cosmeticsData, marketplaceData] = await Promise.all([
        apiRequest<{ user: AuthUser }>("/users/me"),
        apiRequest<{ profile: UserProfile }>("/users/me/profile"),
        apiRequest<{ characterClasses: CharacterClass[] }>("/users/character-classes"),
        apiRequest<{ skills: Skill[] }>("/users/skills"),
        apiRequest<{ cosmetics: CosmeticItem[] }>("/users/cosmetics"),
        apiRequest<{ listings: MarketplaceListing[] }>("/users/marketplace/listings")
      ]);

      setUser(meData.user);
      setProfile(profileData.profile);
      setClasses(classesData.characterClasses);
      setSkills(skillsData.skills);
      setCosmetics(cosmeticsData.cosmetics);
      setListings(marketplaceData.listings);
      setName(meData.user.name);
      setAvatarUrl(profileData.profile.avatarUrl ?? "");
    } catch (err) {
      setError(errorMessage(err, "Could not load profile"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, setUser]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  function applyProfile(nextProfile: UserProfile) {
    setProfile(nextProfile);
    setUser({ ...user!, profile: nextProfile });
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const avatar = avatarUrl.trim();

    setSavingProfile(true);
    setError(null);
    setNotice(null);

    try {
      const accountUpdate = await apiRequest<{ user: AuthUser }>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          name,
          avatarUrl: avatar || null
        })
      });

      setUser(accountUpdate.user);
      setProfile(accountUpdate.user.profile as UserProfile | null);
      setNotice("Profile updated.");
    } catch (err) {
      setError(errorMessage(err, "Could not update profile"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function updateTwoStep(enabled: boolean) {
    if (!enabled && user && user.role !== "USER") {
      setError("Two-step verification is mandatory for admin accounts.");
      return;
    }

    setSavingSecurity(true);
    setError(null);
    setNotice(null);

    try {
      // Require a fresh password so an unattended session cannot weaken the account.
      const securityUpdate = await apiRequest<{ user: AuthUser }>(`/auth/two-step/${enabled ? "enable" : "disable"}`, {
        method: "POST",
        body: JSON.stringify({ currentPassword: password })
      });

      setUser(securityUpdate.user);
      setPassword("");
      setNotice(enabled ? "Two-step verification is enabled." : "Two-step verification is disabled.");
    } catch (err) {
      setError(errorMessage(err, "Could not update two-step verification"));
    } finally {
      setSavingSecurity(false);
    }
  }

  async function selectClass(id: string) {
    setSavingClassId(id);
    setError(null);
    setNotice(null);

    try {
      const classSelection = await apiRequest<{ profile: UserProfile }>("/users/me/character-class", {
        method: "PATCH",
        body: JSON.stringify({ characterClassId: id })
      });

      applyProfile(classSelection.profile);
      setNotice("Character class selected.");
    } catch (err) {
      setError(errorMessage(err, "Could not select character class"));
    } finally {
      setSavingClassId(null);
    }
  }

  async function equipCosmetic(id: string) {
    setSavingCosmeticId(id);
    setError(null);
    setNotice(null);

    try {
      const cosmeticSelection = await apiRequest<{ profile: UserProfile }>("/users/me/cosmetic", {
        method: "PATCH",
        body: JSON.stringify({ cosmeticItemId: id })
      });

      applyProfile(cosmeticSelection.profile);
      setCosmetics((current) => markSelectedCosmetic(current, id));
      setPreviewId(id);
      setNotice("Cosmetic selected.");
    } catch (err) {
      setError(errorMessage(err, "Could not select cosmetic"));
    } finally {
      setSavingCosmeticId(null);
    }
  }

  async function purchaseCosmetic(id: string) {
    setSavingCosmeticId(id);
    setError(null);
    setNotice(null);

    try {
      const cosmeticPurchase = await apiRequest<{ profile: UserProfile }>("/users/me/cosmetic/purchase", {
        method: "POST",
        body: JSON.stringify({ cosmeticItemId: id })
      });

      applyProfile(cosmeticPurchase.profile);
      setCosmetics((current) => markOwnedCosmetic(current, id));
      setNotice("Cosmetic purchased.");
    } catch (err) {
      setError(errorMessage(err, "Could not purchase cosmetic"));
    } finally {
      setSavingCosmeticId(null);
    }
  }

  async function refreshMarketplace(searchValue = search) {
    const searchParams = new URLSearchParams();
    const term = searchValue.trim();

    if (term) {
      searchParams.set("q", term);
    }

    const query = searchParams.toString();
    const marketplace = await apiRequest<{ listings: MarketplaceListing[] }>(`/users/marketplace/listings${query ? `?${query}` : ""}`);
    setListings(marketplace.listings);
  }

  async function searchMarketplace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingListingId("marketplace-search");
    setError(null);
    setNotice(null);

    try {
      await refreshMarketplace();
    } catch (err) {
      setError(errorMessage(err, "Could not search marketplace"));
    } finally {
      setSavingListingId(null);
    }
  }

  async function clearMarketplaceSearch() {
    setSearch("");
    setSavingListingId("marketplace-search");
    setError(null);
    setNotice(null);

    try {
      await refreshMarketplace("");
    } catch (err) {
      setError(errorMessage(err, "Could not clear marketplace search"));
    } finally {
      setSavingListingId(null);
    }
  }

  async function createListing(id: string) {
    const priceCoins = Number(prices[id]);

    if (!Number.isInteger(priceCoins) || priceCoins <= 0) {
      setError("Enter a whole coin price before listing this cosmetic.");
      return;
    }

    setSavingListingId(id);
    setError(null);
    setNotice(null);

    try {
      await apiRequest<{ listing: MarketplaceListing }>("/users/marketplace/listings", {
        method: "POST",
        body: JSON.stringify({ cosmeticItemId: id, priceCoins })
      });
      setPrices((current) => ({ ...current, [id]: "" }));
      await refreshMarketplace();
      setNotice("Cosmetic listed on the marketplace.");
    } catch (err) {
      setError(errorMessage(err, "Could not list cosmetic"));
    } finally {
      setSavingListingId(null);
    }
  }

  async function buyListing(id: string) {
    setSavingListingId(id);
    setError(null);
    setNotice(null);

    try {
      const listingPurchase = await apiRequest<{ listing: MarketplaceListing; profile: UserProfile }>(`/users/marketplace/listings/${id}/buy`, {
        method: "POST"
      });
      applyProfile(listingPurchase.profile);
      await loadProfileData();
      await refreshMarketplace();
      setNotice("Marketplace purchase complete.");
    } catch (err) {
      setError(errorMessage(err, "Could not buy marketplace listing"));
    } finally {
      setSavingListingId(null);
    }
  }

  async function cancelListing(id: string) {
    setSavingListingId(id);
    setError(null);
    setNotice(null);

    try {
      await apiRequest<{ listing: MarketplaceListing }>(`/users/marketplace/listings/${id}/cancel`, {
        method: "POST"
      });
      await refreshMarketplace();
      setNotice("Marketplace listing cancelled.");
    } catch (err) {
      setError(errorMessage(err, "Could not cancel marketplace listing"));
    } finally {
      setSavingListingId(null);
    }
  }

  function changePrice(id: string, price: string) {
    setPrices((current) => ({ ...current, [id]: price }));
  }

  if (!accessToken || !user) {
    return <RouteFallback />;
  }

  const twoStepLocked = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  return (
    <AppShell eyebrow="Profile" title="Character profile">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      <section className="mb-6 overflow-hidden rounded-md border border-ink bg-ink text-white shadow-command">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="p-6 sm:p-7">
            <ProfileIdentity
              avatar={avatarPreview}
              classLabel={selectedClass?.name ?? "Class unselected"}
              email={user.email}
              initials={initials}
              level={level}
              name={user.name}
              preview={preview}
            />

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3 text-xs font-bold text-white/45">
                <span>Level {level}</span>
                <span>{totalXp % 1000}/1000 XP</span>
                <span>Level {level + 1}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-md bg-white/10">
                <div
                  aria-label={`${levelProgress}% progress to level ${level + 1}`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={levelProgress}
                  className="lx-progress-fill h-full rounded-md bg-mint"
                  role="progressbar"
                  style={{ width: `${levelProgress}%` }}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <CharacterMetric icon={Sparkles} label="Total XP" value={totalXp} />
              <CharacterMetric icon={Coins} label="Coins" value={coinBalance} />
              <CharacterMetric icon={Flame} label="Streak" value={`${profile?.currentStreak ?? user.profile?.currentStreak ?? 0}d`} />
              <CharacterMetric icon={Pickaxe} label="Skills" value={`${unlockedCount}/${skills.length}`} />
            </div>
          </div>

          <aside className="border-t border-white/10 bg-white/5 p-6 lg:border-l lg:border-t-0">
            <p className="text-xs font-bold uppercase text-white/45">Current loadout</p>
            <dl className="mt-4 divide-y divide-white/10 border-y border-white/10">
              <LoadoutRow label="Class" value={selectedClass?.name ?? "Choose a class"} />
              <LoadoutRow label="Cosmetic" value={selectedCosmetic?.name ?? "Default appearance"} />
              <LoadoutRow label="Security" value={user.twoStepEnabled ? "Two-step active" : "Two-step off"} warning={!user.twoStepEnabled} />
            </dl>
            <div className="mt-5 grid gap-2">
              <ProfileLink href="/skills" label="Open mastery paths" />
              <ProfileLink href="/achievements" label="View achievement hall" />
              <ProfileLink href="/rewards" label="Open reward vault" />
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <PagePanel>
          <div className="flex items-center gap-4">
            <ProfileAvatar alt={user.name} image={avatarPreview} initials={initials} preview={preview} variant="card" />
            <div>
              <p className="text-sm font-semibold text-mint">Level {level}</p>
              <h2 className="text-2xl font-bold">{user.name}</h2>
              <SupportingText spaced>{user.email}</SupportingText>
              {preview && (
                <RarityTag block rarity={preview.rarity}>
                  {preview.selected ? "Equipped" : "Previewing"}: {preview.name}
                </RarityTag>
              )}
            </div>
          </div>

          <ProfileSection compact>
            <PanelHeading
              description={preview ? `${slotLabel(preview.slot)} / ${preview.rarity}` : "No cosmetic preview selected"}
              icon={Palette}
              iconClass="bg-mint/10 text-mint"
              title="Avatar preview"
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <PreviewDetail label="Frame" value={preview?.slot === "AVATAR_FRAME" ? preview.name : "Default frame"} />
              <PreviewDetail label="Badge" value={preview?.slot === "PROFILE_BADGE" ? preview.name : "No badge selected"} />
            </div>
          </ProfileSection>

          <form className="mt-6 grid gap-4" onSubmit={updateProfile}>
            <Input
              disabled={savingProfile || loading}
              label="Display name"
              name="name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            <Input
              disabled={savingProfile || loading}
              label="Avatar URL"
              name="avatarUrl"
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://example.com/avatar.png"
              value={avatarUrl}
            />
            <Button disabled={savingProfile || loading || name.trim().length < 2} type="submit">
              Save profile
            </Button>
          </form>

          <ProfileSection>
            <PanelHeading
              description={user.twoStepEnabled ? "Two-step verification is active" : "Two-step verification is off"}
              icon={ShieldCheck}
              iconClass="bg-mint/10 text-mint"
              title="Account security"
            />
            {twoStepLocked ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-4 text-sm">
                <span className="flex items-center gap-2 font-semibold text-mint">
                  <Lock size={17} />
                  Required for privileged access
                </span>
                <Link className="inline-flex items-center gap-1 font-semibold text-violet hover:text-ink" href="/admin/security">
                  Passkey security
                  <ArrowRight size={15} />
                </Link>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <Input
                  disabled={savingSecurity}
                  label="Current password"
                  name="securityPassword"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <Button
                  disabled={savingSecurity || password.length === 0}
                  type="button"
                  onClick={() => void updateTwoStep(!user.twoStepEnabled)}
                >
                  <ShieldCheck size={18} />
                  {savingSecurity ? "Updating security" : user.twoStepEnabled ? "Disable two-step" : "Enable two-step"}
                </Button>
              </div>
            )}
          </ProfileSection>

          <ProfileSection>
            <PanelHeading
              description={<>{unlockedCount} unlocked / {skills.length} available</>}
              icon={Pickaxe}
              iconClass="bg-violet/10 text-violet"
              title="Skill progress"
            />
            <div className="mt-4 grid gap-2">
              {loading ? (
                <ProfileMessage>Loading skills...</ProfileMessage>
              ) : skills.length === 0 ? (
                <ProfileMessage>No skills are available yet.</ProfileMessage>
              ) : (
                skills.slice(0, 3).map((skill) => <SkillRow key={skill.id} skill={skill} />)
              )}
            </div>
          </ProfileSection>

          <ProfileSection>
            <PanelHeading
              description={<>{ownedCount} owned / {cosmetics.length} available</>}
              icon={Gem}
              iconClass="bg-ember/10 text-ember"
              title="Cosmetic inventory"
            />

            <div className="mt-4 grid gap-3">
              <FilterGroup>
                {(["ALL", "AVATAR_FRAME", "PROFILE_BADGE"] as const).map((slot) => (
                  <FilterButton
                    active={slotFilter === slot}
                    key={slot}
                    onClick={() => setSlotFilter(slot)}
                  >
                    {slot === "ALL" ? "All slots" : slotLabel(slot)}
                  </FilterButton>
                ))}
              </FilterGroup>
              <FilterGroup>
                {(["ALL", "OWNED", "LOCKED"] as const).map((filter) => (
                  <FilterButton
                    active={ownershipFilter === filter}
                    key={filter}
                    onClick={() => setOwnershipFilter(filter)}
                  >
                    {filter === "ALL" ? "All items" : filter === "OWNED" ? "Owned" : "Locked"}
                  </FilterButton>
                ))}
              </FilterGroup>
            </div>

            <div className="mt-4 grid gap-2">
              {loading ? (
                <ProfileMessage>Loading cosmetics...</ProfileMessage>
              ) : cosmetics.length === 0 ? (
                <ProfileMessage>No cosmetics are available yet.</ProfileMessage>
              ) : filteredCosmetics.length === 0 ? (
                <ProfileMessage>No cosmetics match these filters.</ProfileMessage>
              ) : (
                (["AVATAR_FRAME", "PROFILE_BADGE"] as const).map((slot) =>
                  cosmeticGroups[slot].length > 0 && (
                    <div className="grid gap-2" key={slot}>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink/40">{slotLabel(slot)}</p>
                      {cosmeticGroups[slot].map((cosmetic) => (
                        <CosmeticCard
                          balance={coinBalance}
                          busyCosmetic={Boolean(savingCosmeticId)}
                          busyListing={savingListingId === cosmetic.id}
                          cosmetic={cosmetic}
                          key={cosmetic.id}
                          level={level}
                          onEquip={equipCosmetic}
                          onList={createListing}
                          onPreview={setPreviewId}
                          onPriceChange={changePrice}
                          onPurchase={purchaseCosmetic}
                          previewing={preview?.id === cosmetic.id}
                          price={prices[cosmetic.id] ?? ""}
                        />
                      ))}
                    </div>
                  )
                )
              )}
            </div>
          </ProfileSection>
        </PagePanel>

        <PagePanel>
          <SideHeading
            description={
              selectedClass
                ? `${selectedClass.name} selected with ${multiplierLabel(selectedClass.baseXpMultiplier)}.`
                : "Choose a class to shape future progression bonuses."
            }
            icon={UserCircle2}
            iconClass="bg-violet/10 text-violet"
            title="Character class"
          />

          <div className="mt-5 grid gap-3">
            {loading ? (
              <ProfileMessage>Loading character classes...</ProfileMessage>
            ) : classes.length === 0 ? (
              <ProfileMessage>No character classes are available yet.</ProfileMessage>
            ) : (
              classes.map((characterClass) => (
                <ClassChoice
                  active={selectedClass?.id === characterClass.id}
                  busy={Boolean(savingClassId)}
                  characterClass={characterClass}
                  key={characterClass.id}
                  onSelect={selectClass}
                />
              ))
            )}
          </div>

          <ProfileSection>
            <SideHeading
              description="Trade cosmetics with other players using coins."
              icon={Gem}
              iconClass="bg-ember/10 text-ember"
              title="Cosmetic marketplace"
            />
            <form className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={searchMarketplace}>
              <Input
                label="Search listings"
                name="marketplaceSearch"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cosmetic or seller"
                value={search}
              />
              <Button disabled={savingListingId === "marketplace-search"} type="submit">
                <Search size={16} />
                Search
              </Button>
              {Boolean(search.trim()) && (
                <Button
                  disabled={savingListingId === "marketplace-search"}
                  onClick={() => void clearMarketplaceSearch()}
                  type="button"
                  variant="ghost"
                >
                  Clear
                </Button>
              )}
            </form>
            <div className="mt-4 grid gap-3">
              {listings.length === 0 ? (
                <p className="rounded-md bg-paper px-3 py-3 text-sm text-ink/55">No active marketplace listings yet.</p>
              ) : (
                listings.slice(0, 6).map((listing) => (
                  <ListingCard
                    balance={coinBalance}
                    busy={Boolean(savingListingId)}
                    key={listing.id}
                    listing={listing}
                    mine={listing.sellerId === user.id}
                    onBuy={buyListing}
                    onCancel={cancelListing}
                  />
                ))
              )}
            </div>
          </ProfileSection>
        </PagePanel>
      </section>

      <AccountControlPanel enabled={Boolean(accessToken)} role={user.role} />
    </AppShell>
  );
}

function ProfileIdentity({
  avatar,
  classLabel,
  email,
  initials,
  level,
  name,
  preview
}: {
  avatar: string;
  classLabel: string;
  email: string;
  initials: string;
  level: number;
  name: string;
  preview: CosmeticItem | null;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <ProfileAvatar alt={name} image={avatar} initials={initials} preview={preview} variant="hero" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <HeroTag>Level {level}</HeroTag>
          <HeroTag muted>{classLabel}</HeroTag>
        </div>
        <h2 className="mt-3 truncate text-2xl font-bold sm:text-3xl">{name}</h2>
        <p className="mt-1 truncate text-sm text-white/45">{email}</p>
      </div>
    </div>
  );
}

function HeroTag({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={clsx(
        "rounded-md",
        muted ? "bg-white/10" : "bg-mint",
        "px-2.5 py-1 text-xs font-bold",
        muted ? "text-white/70" : "text-white"
      )}
    >
      {children}
    </span>
  );
}

function ProfileSection({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className={clsx(compact ? "mt-5" : "mt-6", "rounded-lg border border-ink/10 p-4")}>
      {children}
    </div>
  );
}

function CharacterMetric({ icon: Icon, label, value: metric }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="flex min-w-[118px] items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2">
      <Icon className="shrink-0 text-mint" size={16} />
      <span>
        <span className="block text-[10px] font-bold uppercase text-white/45">{label}</span>
        <span className="block text-sm font-bold text-white">{metric}</span>
      </span>
    </div>
  );
}

function LoadoutRow({ label, value: detail, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm">
      <dt className="text-white/45">{label}</dt>
      <dd className={clsx("truncate font-bold", warning ? "text-ember" : "text-white")}>{detail}</dd>
    </div>
  );
}

function ProfileLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="lx-button flex h-10 items-center justify-between rounded-md border border-white/10 px-3 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white" href={href}>
      {label}
      <ArrowRight size={15} />
    </Link>
  );
}

function ProfileMessage({ children }: { children: ReactNode }) {
  return <p className={emptyMessageClass}>{children}</p>;
}

function ProfileAvatar({
  alt,
  image,
  initials,
  preview,
  variant
}: {
  alt: string;
  image: string;
  initials: string;
  preview: CosmeticItem | null;
  variant: "hero" | "card";
}) {
  const framed = preview?.slot === "AVATAR_FRAME";
  const hero = variant === "hero";

  return (
    <div
      className={clsx(
        hero ? "w-fit rounded-md border-4 p-1" : "rounded-md border-4 p-1",
        framed ? rarityClasses(preview.rarity) : hero ? "border-white/15 bg-white/5" : "border-ink/10 bg-paper"
      )}
    >
      {image ? (
        <Image
          alt={alt}
          className={clsx("h-20 w-20", hero ? "rounded-md" : "rounded-lg", "object-cover")}
          height={80}
          src={image}
          unoptimized
          width={80}
        />
      ) : (
        <div
          className={clsx(
            "flex h-20 w-20 items-center justify-center",
            hero ? "rounded-md bg-white/10" : "rounded-lg bg-ink",
            "text-2xl font-bold text-white"
          )}
        >
          {initials || <UserCircle2 size={30} />}
        </div>
      )}
    </div>
  );
}

function PanelHeading({
  description,
  icon: Icon,
  iconClass,
  title
}: {
  description: ReactNode;
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
        <SectionHeading>{title}</SectionHeading>
        <SupportingText>{description}</SupportingText>
      </div>
    </div>
  );
}

function SideHeading({
  description,
  icon: Icon,
  iconClass,
  title
}: {
  description: ReactNode;
  icon: LucideIcon;
  iconClass: string;
  title: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <SectionHeading>{title}</SectionHeading>
        <SupportingText spaced>{description}</SupportingText>
      </div>
      <div className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", iconClass)}>
        <Icon size={20} />
      </div>
    </div>
  );
}

function PreviewDetail({ label, value: detail }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <MetaLabel>{label}</MetaLabel>
      <p className="mt-1 text-sm font-semibold">{detail}</p>
    </div>
  );
}

function SkillRow({ skill }: { skill: Skill }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{skill.name}</p>
        <p className={clsx("text-xs font-semibold", skill.unlocked ? "text-mint" : "text-ink/40")}>
          Level {skill.currentLevel}/{skill.maxLevel}
        </p>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={clsx(
        "rounded-md border px-3 py-2 text-sm font-semibold transition",
        active ? "border-ink bg-ink text-white" : "border-ink/10 bg-white text-ink hover:border-ink/30"
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function FilterGroup({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-3">{children}</div>;
}

function RarityTag({
  block = false,
  children,
  rarity
}: {
  block?: boolean;
  children: ReactNode;
  rarity: CosmeticItem["rarity"];
}) {
  const Tag = block ? "p" : "span";

  return (
    <Tag
      className={clsx(
        block
          ? "mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-semibold"
          : "rounded-md border px-2 py-1 text-xs font-semibold",
        rarityClasses(rarity)
      )}
    >
      {children}
    </Tag>
  );
}

function CosmeticCard({
  balance,
  busyCosmetic,
  busyListing,
  cosmetic,
  level,
  onEquip,
  onList,
  onPreview,
  onPriceChange,
  onPurchase,
  previewing,
  price
}: {
  balance: number;
  busyCosmetic: boolean;
  busyListing: boolean;
  cosmetic: CosmeticItem;
  level: number;
  onEquip: (id: string) => Promise<void>;
  onList: (id: string) => Promise<void>;
  onPreview: (id: string) => void;
  onPriceChange: (id: string, price: string) => void;
  onPurchase: (id: string) => Promise<void>;
  previewing: boolean;
  price: string;
}) {
  const canAfford = balance >= cosmetic.coinPrice;
  const canUnlock = level >= cosmetic.unlockLevel;

  return (
    <div
      className={clsx(
        "rounded-md border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-65",
        cosmetic.selected
          ? "border-ink bg-ink text-white"
          : cosmetic.owned
            ? "border-mint/20 bg-mint/5 text-ink hover:border-mint/45"
            : "border-ink/10 bg-paper text-ink/55"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          {cosmetic.owned ? <Gem size={15} /> : <Lock size={15} />}
          {cosmetic.name}
        </span>
        <RarityTag rarity={cosmetic.rarity}>
          {cosmetic.rarity}
        </RarityTag>
      </div>
      <p className={clsx("mt-2 text-sm", cosmetic.selected ? "text-white/65" : "text-ink/55")}>
        {cosmetic.description}
      </p>
      <div
        className={clsx(
          "mt-3 grid gap-2 text-xs",
          cosmetic.selected ? "text-white/65 sm:grid-cols-2" : "text-ink/50 sm:grid-cols-2"
        )}
      >
        <span>Unlock level {cosmetic.unlockLevel}</span>
        <span>{cosmetic.owned ? "Owned" : `${cosmetic.coinPrice} coins`}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={clsx(
            "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
            previewing ? "border-violet bg-violet text-white" : "border-ink/10 bg-white text-ink hover:border-violet/40"
          )}
          onClick={() => onPreview(cosmetic.id)}
          type="button"
        >
          <Eye size={16} />
          {previewing ? "Previewing" : "Preview"}
        </button>
        {!cosmetic.owned ? (
          <Button
            disabled={!canAfford || busyCosmetic}
            onClick={() => void onPurchase(cosmetic.id)}
            type="button"
          >
            {canAfford ? "Buy cosmetic" : "Need coins"}
          </Button>
        ) : cosmetic.selected ? null : (
          <Button
            disabled={busyCosmetic || !canUnlock}
            onClick={() => void onEquip(cosmetic.id)}
            type="button"
          >
            Select
          </Button>
        )}
      </div>
      {cosmetic.owned && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            label="Marketplace price"
            name={`marketplace-${cosmetic.id}`}
            type="number"
            min={1}
            value={price}
            onChange={(event) => onPriceChange(cosmetic.id, event.target.value)}
          />
          <Button
            disabled={busyListing || !price}
            onClick={() => void onList(cosmetic.id)}
            type="button"
          >
            List
          </Button>
        </div>
      )}
    </div>
  );
}

function ClassChoice({
  active,
  busy,
  characterClass,
  onSelect
}: {
  active: boolean;
  busy: boolean;
  characterClass: CharacterClass;
  onSelect: (id: string) => Promise<void>;
}) {
  return (
    <button
      aria-pressed={active}
      className={clsx(
        "rounded-lg border p-4 text-left transition",
        active ? "border-ink bg-ink text-white" : "border-ink/10 bg-white text-ink hover:border-ink/30"
      )}
      disabled={busy}
      onClick={() => void onSelect(characterClass.id)}
      type="button"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{characterClass.name}</span>
        <span
          className={clsx(
            "rounded-md px-2 py-1 text-xs font-semibold",
            active ? "bg-white/10 text-white" : "bg-violet/10 text-violet"
          )}
        >
          {multiplierLabel(characterClass.baseXpMultiplier)}
        </span>
      </div>
      <p className={clsx("mt-2 text-sm leading-6", active ? "text-white/70" : "text-ink/60")}>
        {characterClass.description}
      </p>
      {active && <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-mint">Selected</p>}
    </button>
  );
}

function ListingCard({
  balance,
  busy,
  listing,
  mine,
  onBuy,
  onCancel
}: {
  balance: number;
  busy: boolean;
  listing: MarketplaceListing;
  mine: boolean;
  onBuy: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
}) {
  const affordable = balance >= listing.priceCoins;

  return (
    <div className="rounded-md border border-ink/10 bg-paper px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{listing.cosmetic.name}</p>
        <RarityTag rarity={listing.cosmetic.rarity}>
          {listing.cosmetic.rarity}
        </RarityTag>
      </div>
      <p className="mt-2 text-sm text-ink/55">{listing.cosmetic.description}</p>
      <div className="mt-3 grid gap-2 text-xs text-ink/50 sm:grid-cols-2">
        <span>{listing.priceCoins} coins</span>
        <span>Seller: {mine ? "You" : listing.sellerName}</span>
      </div>
      <div className="mt-3">
        {mine ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet">Your listing</p>
            <Button
              disabled={busy}
              onClick={() => void onCancel(listing.id)}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            disabled={!affordable || busy}
            onClick={() => void onBuy(listing.id)}
            type="button"
          >
            {affordable ? "Buy listing" : "Need coins"}
          </Button>
        )}
      </div>
    </div>
  );
}
