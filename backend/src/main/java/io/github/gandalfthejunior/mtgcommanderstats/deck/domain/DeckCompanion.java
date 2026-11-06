package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.ColorIdentityConverter;
import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.CardFacesConverter;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardFace;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.ResolvedCompanion;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.Artwork;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.GameplayCard;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Embeddable;

/** Authoritative gameplay identity and a separately stored printing/artwork snapshot. */
@Embeddable
public class DeckCompanion {
    @Column(name = "oracle_id", nullable = false)
    private UUID oracleId;

    @Column(name = "name", nullable = false, columnDefinition = "text")
    private String name;

    @Column(name = "gameplay_face_index")
    private Integer gameplayFaceIndex;

    @Convert(converter = ColorIdentityConverter.class)
    @Column(name = "base_color_identity", nullable = false, columnDefinition = "text")
    private ColorIdentity baseColorIdentity;

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

    @Convert(converter = CardFacesConverter.class)
    @Column(name = "card_faces", columnDefinition = "text")
    private CardFaces cardFaces;

    protected DeckCompanion() {
    }

    public DeckCompanion(ResolvedCompanion resolved) {
        GameplayCard gameplay = resolved.gameplay();
        this.oracleId = UUID.fromString(gameplay.oracleId());
        this.name = gameplay.name();
        this.gameplayFaceIndex = gameplay.gameplayFaceIndex();
        this.baseColorIdentity = ColorIdentity.fromSymbols(gameplay.colorIdentity());
        Artwork art = gameplay.defaultArtwork();
        this.scryfallCardId = resolved.card().scryfallCardId();
        this.cardFaces = new CardFaces(resolved.card().cardFaces());
        this.artworkFaceIndex = art.artworkFaceIndex();
        this.artCropUrl = art.artCropUrl();
        this.illustrationId = art.illustrationId();
        this.artist = art.artist();
        this.scryfallUri = art.scryfallUri();
    }

    public void changeArtwork(CommanderSelectionRef reference, Artwork artwork, List<CardFace> cardFaces) {
        this.cardFaces = new CardFaces(cardFaces);
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

    public List<CardFace> getCardFaces() {
        return cardFaces == null ? null : cardFaces.faces();
    }

    public String getScryfallUri() {
        return scryfallUri;
    }
}
