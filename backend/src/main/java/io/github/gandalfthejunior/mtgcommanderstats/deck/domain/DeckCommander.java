package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.ColorIdentityConverter;
import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.PairingCapabilitiesConverter;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.PairingCapabilities;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.ResolvedCommander;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.Artwork;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.GameplayCard;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Embeddable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Authoritative gameplay identity and a separately stored printing/artwork snapshot. */
@Embeddable
public class DeckCommander {
    @Column(name = "position")
    private int position;

    @Column(name = "oracle_id", nullable = false)
    private UUID oracleId;

    @Column(name = "name", nullable = false, columnDefinition = "text")
    private String name;

    @Column(name = "gameplay_face_index")
    private Integer gameplayFaceIndex;

    @Convert(converter = ColorIdentityConverter.class)
    @Column(name = "base_color_identity", nullable = false, columnDefinition = "text")
    private ColorIdentity baseColorIdentity;

    @Column(name = "requires_chosen_color", nullable = false)
    private boolean requiresChosenColor;

    @Column(name = "can_be_sole_commander", nullable = false)
    private boolean canBeSoleCommander;

    @Convert(converter = PairingCapabilitiesConverter.class)
    @Column(name = "pairing", columnDefinition = "text")
    private PairingCapabilities pairing;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "chosen_color", columnDefinition = "char(1)")
    private String chosenColor;

    @Column(name = "scryfall_card_id", nullable = false)
    private UUID scryfallCardId;

    @Column(name = "artwork_face_index")
    private Integer artworkFaceIndex;

    @Column(name = "art_crop_url", columnDefinition = "text")
    private String artCropUrl;

    @Column(name = "illustration_id", columnDefinition = "text")
    private String illustrationId;

    @Column(name = "artist", columnDefinition = "text")
    private String artist;

    @Column(name = "scryfall_uri", columnDefinition = "text")
    private String scryfallUri;

    protected DeckCommander() {
    }

    public DeckCommander(int position, ResolvedCommander resolved, String chosenColor) {
        GameplayCard gameplay = resolved.gameplay();
        if (position < 1 || position > 2
                || (gameplay.requiresChosenColor() ? chosenColor == null || !List.of("W", "U", "B", "R", "G").contains(chosenColor)
                        : chosenColor != null)) {
            throw new InvalidCommanderException();
        }
        this.pairing = gameplay.pairing();
        this.position = position;
        this.oracleId = UUID.fromString(gameplay.oracleId());
        this.name = gameplay.name();
        this.gameplayFaceIndex = gameplay.gameplayFaceIndex();
        this.baseColorIdentity = ColorIdentity.fromSymbols(gameplay.colorIdentity());
        this.requiresChosenColor = gameplay.requiresChosenColor();
        this.canBeSoleCommander = gameplay.canBeSoleCommander();
        this.chosenColor = chosenColor;
        Artwork art = gameplay.defaultArtwork();
        this.scryfallCardId = resolved.card().scryfallCardId();
        this.artworkFaceIndex = art.artworkFaceIndex();
        this.artCropUrl = art.artCropUrl();
        this.illustrationId = art.illustrationId();
        this.artist = art.artist();
        this.scryfallUri = art.scryfallUri();
    }

    public ColorIdentity effectiveColorIdentity() {
        List<String> colors = new ArrayList<>(baseColorIdentity.symbols());
        if (chosenColor != null && !colors.contains(chosenColor)) {
            colors.add(chosenColor);
        }
        return ColorIdentity.fromSymbols(colors);
    }

    public boolean sameGameplay(DeckCommander other) {
        return position == other.position && oracleId.equals(other.oracleId)
                && Objects.equals(chosenColor, other.chosenColor)
                && effectiveColorIdentity().canonicalValue().equals(other.effectiveColorIdentity().canonicalValue());
    }

    void preserveArtwork(DeckCommander previous) {
        this.artworkFaceIndex = previous.artworkFaceIndex;
        this.artCropUrl = previous.artCropUrl;
        this.illustrationId = previous.illustrationId;
        this.artist = previous.artist;
        this.scryfallUri = previous.scryfallUri;
    }

    public void changeArtwork(CommanderSelectionRef reference, Artwork artwork) {
        this.scryfallCardId = reference.scryfallCardId();
        // This selector is printing-local; remap it to the same immutable Oracle identity.
        this.gameplayFaceIndex = reference.gameplayFaceIndex();
        this.artworkFaceIndex = artwork.artworkFaceIndex();
        this.artCropUrl = artwork.artCropUrl();
        this.illustrationId = artwork.illustrationId();
        this.artist = artwork.artist();
        this.scryfallUri = artwork.scryfallUri();
    }

    public CommanderSelectionRef selectionRef() {
        return new CommanderSelectionRef(scryfallCardId, gameplayFaceIndex);
    }

    public PairingCapabilities getPairing() {
        return pairing == null ? PairingCapabilities.NONE : pairing;
    }

    public int getPosition() {
        return position;
    }

    public UUID getOracleId() {
        return oracleId;
    }

    public String getName() {
        return name;
    }

    public Integer getGameplayFaceIndex() {
        return gameplayFaceIndex;
    }

    public ColorIdentity getBaseColorIdentity() {
        return baseColorIdentity;
    }

    public boolean getRequiresChosenColor() {
        return requiresChosenColor;
    }

    public boolean getCanBeSoleCommander() {
        return canBeSoleCommander;
    }

    public String getChosenColor() {
        return chosenColor;
    }

    public UUID getScryfallCardId() {
        return scryfallCardId;
    }

    public Integer getArtworkFaceIndex() {
        return artworkFaceIndex;
    }

    public String getArtCropUrl() {
        return artCropUrl;
    }

    public String getIllustrationId() {
        return illustrationId;
    }

    public String getArtist() {
        return artist;
    }

    public String getScryfallUri() {
        return scryfallUri;
    }
}
