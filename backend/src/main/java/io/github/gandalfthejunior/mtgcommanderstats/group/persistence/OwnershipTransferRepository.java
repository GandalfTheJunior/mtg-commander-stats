package io.github.gandalfthejunior.mtgcommanderstats.group.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.group.domain.OwnershipTransfer;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.OwnershipTransfer.State;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OwnershipTransferRepository extends JpaRepository<OwnershipTransfer, UUID> {
    Optional<OwnershipTransfer> findByGroupIdAndState(UUID groupId, State state);

    Optional<OwnershipTransfer> findByIdAndGroupId(UUID id, UUID groupId);

    List<OwnershipTransfer> findTop20ByGroupIdAndRequesterIdAndStateInAndAcknowledgedAtIsNullOrderByCreatedAtAscIdAsc(
            UUID groupId, UUID requesterId, List<State> states);
}
