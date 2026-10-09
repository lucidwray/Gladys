import { Text, Localizer } from 'preact-i18n';
import cx from 'classnames';

import { RequestStatus } from '../../utils/consts';
import dashboardStyle from '../dashboard/style.css';
import ControlsTile from './ControlsTile';
import { groupDevicesByRoom, matchesSearch } from './helpers';
import style from './style.css';

const NO_ROOM_FILTER = 'no-room';
const SKELETON_TILES = 8;

const ControlsListPage = ({
  devices,
  rooms,
  status,
  search,
  selectedRoomId,
  user,
  intl,
  onSearch,
  onSelectRoom,
  onRetry,
  onToggle
}) => {
  const isLoading = devices === null && status === RequestStatus.Getting;
  const hasError = status === RequestStatus.Error && devices === null;
  const deviceCount = devices ? devices.length : 0;

  const filteredDevices = (devices || [])
    .filter(device => matchesSearch(device, search))
    .filter(device => {
      if (!selectedRoomId) {
        return true;
      }
      return selectedRoomId === NO_ROOM_FILTER ? !device.room_id : device.room_id === selectedRoomId;
    });
  const groups = groupDevicesByRoom(filteredDevices, rooms);

  let body;
  if (hasError) {
    body = (
      <div class="alert alert-danger d-flex align-items-center justify-content-between">
        <span>
          <Text id="hawrayControls.list.error" />
        </span>
        <button type="button" class="btn btn-sm btn-outline-danger" onClick={onRetry}>
          <Text id="hawrayControls.list.retry" />
        </button>
      </div>
    );
  } else if (isLoading) {
    body = (
      <div class="row">
        {Array.from({ length: SKELETON_TILES }).map((_, index) => (
          <div key={`skeleton-${index}`} class="col-6 col-md-4 col-xl-3 mb-3">
            <div class={cx('card', 'mb-0', style.skeleton)} />
          </div>
        ))}
      </div>
    );
  } else if (deviceCount === 0) {
    body = (
      <div class="empty">
        <p class="empty-title">
          <Text id="hawrayControls.list.empty" />
        </p>
      </div>
    );
  } else if (filteredDevices.length === 0) {
    body = (
      <div class="text-muted">
        <Text id="hawrayControls.list.noMatch" />
      </div>
    );
  } else {
    body = groups.map(group => (
      <section key={group.key} class="mb-4">
        <h2 class={cx('h5', 'text-muted', 'mb-3', style.roomTitle)}>
          {group.name || <Text id="hawrayControls.list.noRoom" />}
          <span class="badge badge-light ml-2">{group.devices.length}</span>
        </h2>
        <div class="row">
          {group.devices.map(device => (
            <div key={device.selector} class="col-6 col-md-4 col-xl-3 mb-3">
              <ControlsTile device={device} user={user} intl={intl} onToggle={onToggle} />
            </div>
          ))}
        </div>
      </section>
    ));
  }

  return (
    <div class="page">
      {/* Same glass scene as the devices page, so the two lists read as one family */}
      <div
        class={cx(
          'page-main',
          'glass-theme',
          style.controlsPage,
          dashboardStyle.dashboardBackground,
          dashboardStyle.glassScene
        )}
      >
        <div class="py-3 py-md-5">
          <div class="container">
            <div class="page-header">
              <h1 class="page-title">
                <Text id="hawrayControls.list.title" />
              </h1>
              {devices && (
                <div class="page-subtitle">
                  <Text id="hawrayControls.list.deviceCount" plural={deviceCount} fields={{ count: deviceCount }} />
                </div>
              )}
            </div>
            {devices && deviceCount > 0 && (
              <div class={cx('d-flex', 'flex-wrap', 'mb-3', style.toolbar)}>
                <Localizer>
                  <input
                    type="search"
                    class="form-control mr-2 mb-2"
                    value={search}
                    onInput={onSearch}
                    placeholder={<Text id="hawrayControls.list.searchPlaceholder" />}
                    aria-label={<Text id="hawrayControls.list.searchPlaceholder" />}
                  />
                </Localizer>
                <select onChange={onSelectRoom} class="form-control custom-select w-auto mb-2">
                  <option value="">
                    <Text id="hawrayControls.list.allRooms" />
                  </option>
                  <option value={NO_ROOM_FILTER} selected={selectedRoomId === NO_ROOM_FILTER}>
                    <Text id="hawrayControls.list.noRoom" />
                  </option>
                  {rooms.map(room => (
                    <option key={room.id} value={room.id} selected={selectedRoomId === room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {body}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ControlsListPage;
