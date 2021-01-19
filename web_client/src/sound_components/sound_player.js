import connectionConfig from "../config/connectionConfig.json";
import * as common from "../resource/common";

class SoundPlayer {

  static LOADING = 0;
  static READY = 1;
  static PLAYING = 2;

  constructor(manager) {
    this.bgmList = [];
    this.bgmIndex = 0;
    this.bgmState = SoundPlayer.LOADING;
    this.soundInfo = {
      initTime: 0,
      seek: 0,
      duration: 0
    }
    this.bgmOptions = {
      autoPlay: true,
      randomPlay: true
    };
    this.manager = manager;
    this.audioContext = null;
    this.buffer = null;
    this.source = null;
    this.abortController = new Map()
        .set('LIST', new AbortController())
        .set('BUFFER', new AbortController());
    this.listAbortController = new AbortController();
    this.bufferAbortController = new AbortController();
  }


  /**
   * User의 직접적인 조작 또는 최초 시작 등
   * Trigger 에 의해 상태 값이 변경되는 항목
   */
  updatePlayerState = () => {
    this.manager.handleUpdatePlayerState({
      bgmList: this.bgmList,
      bgmIndex: this.bgmIndex,
      bgmState: this.bgmState,
      soundInfo: {
        initTime: this.soundInfo.initTime,
        seek: this.soundInfo.seek,
        duration: this.setCurrentDuration()
      },
      bgmOptions: {
        autoPlay: this.bgmOptions.autoPlay,
        randomPlay: this.bgmOptions.randomPlay
      },
      func_playBgm: this.playBgm,
      func_pauseBgm: this.pauseBgm,
      func_playNextBgm: this.playNextBgm
    });
  }


  /**
   * User의 직접 조작과는 무관하게
   * 사운드가 연주되면서 실시간으로 변경되는 항목
   * MainScene이 매 Frame 마다 호출하면 상태 값을 갱신해서 리턴한다.
   */
  getUpdatePlayerStatePerFrame = () => {
    return {
      seek: this.setCurrentSeek()
    }
  }


  /**
   * AudioContext 초기화
   * SoundPlayer 를 사용하기 위해서 가장 먼저 선행.
   */
  initPlayer = () => {
    if(!this.audioContext){
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }


  /**
   * 다음 곡의 인덱스를 선택하고 상태 업데이트
   * randomPlay -> 랜덤 인덱스
   * !randomPlay -> 인덱스 + 1
   */
  getNextIndex = () => {
    if(this.bgmOptions.randomPlay){
      this.bgmIndex = common.getRandomInt(0, this.bgmList.length);
    }else if(this.bgmList.length > 0) {
      this.bgmIndex = (this.bgmIndex + 1) % this.bgmList.length;
    }
    this.updatePlayerState();
  }


  /**
   * 이전 Fetch 작업이 진행중이라면 signal 을 보내
   * 해당 네트워크 요청을 취소한다.
   * @param controllerName
   */
  abortPreviousFetch = (controllerName) => {
    this.abortController.get(controllerName).abort();
    this.abortController.set(controllerName, new AbortController());
  }


  /**
   * 곡 리스트를 서버에서 불러와 적재
   * 먼저 진행중이던 fetch 작업이 있다면 취소한다.
   * @returns {Promise<void>}
   */
  loadList = async () => {
    let signalKey = 'LIST';
    this.setPlayingStatus(SoundPlayer.LOADING);
    try{
      let url = connectionConfig.bgmServerUrl + 'list';
      this.abortPreviousFetch(signalKey);
      let response = await fetch(url, {signal: this.abortController.get(signalKey).signal});
      if(response.ok && response.status === 200){
        let jsonResp = await response.json();
        this.bgmList = jsonResp.bgmInfoList;
        this.getNextIndex();
      }else{
        // 리스트 로드 실패 - 서버측 오류
        console.log(response);
      }
    }catch(err) {
      // 리스트 로드 실패 - 클라이언트 측 오류
      console.log(err);
    }
    this.setPlayingStatus(SoundPlayer.READY);
  }


  /**
   * 현재 SoundPlayer 가 재생가능한 상태인지 판
   * @returns {boolean}
   */
  isAudioAvailable = () => {
    // TODO: Audio 재생가능한 상태인지 판별 구현해야 함.
    return true;
  }


  /**
   * 현재 sound_player의 Bgm 연주 상태를 갱신하고,
   * 연결된 UI 매니저에 통보 한다.
   * LOADING = 0;
   * READY = 1;
   * PLAYING = 2;
   * @param status
   */
  setPlayingStatus = (status) => {
    if(status === SoundPlayer.LOADING || status === SoundPlayer.READY
        || status === SoundPlayer.PLAYING){
      this.bgmState = status;
      this.updatePlayerState();
    }
  }


  /**
   * 현재 지정된 곡 리스트를 서버로 부터 호출하여
   * buffer 에 적재한다.
   * @returns {Promise<boolean>}
   */
  loadSound = async () => {
    if(!this.isAudioAvailable()) return false;
    let loadSuccess = false;
    let signalKey = 'BUFFER';
    this.setPlayingStatus(SoundPlayer.LOADING);
    try{
      let target = this.bgmList[this.bgmIndex];
      let directory = encodeURIComponent(target.directory);
      let title = encodeURIComponent(target.title);
      let url = connectionConfig.bgmServerUrl + "?directory=" + directory + "&title=" + title;
      this.abortPreviousFetch(signalKey);
      let response = await fetch(url, {signal: this.abortController.get(signalKey).signal});
      if(response.ok && response.status === 200){
        let returnBuffer = await response.arrayBuffer();
        this.buffer = await this.audioContext.decodeAudioData(returnBuffer);
        loadSuccess = true;
      }else{
        // 사운드 로드 실패 처리
        console.log('failed to load sound');
      }
    }catch(err){
      // 사운드 로드 중지
      console.log(err);
    }
    this.setPlayingStatus(SoundPlayer.READY);
    return loadSuccess;
  }


  /**
   * 새로운 Source 를 생성한 후 context 와 연결한다.
   * 기존 buffer 가 존재하거나, load 후 사용 가능.
   */
  initSound = () => {
    if(this.buffer) {
      this.source = this.audioContext.createBufferSource();
      this.source.buffer = this.buffer;
      this.source.loop = false;
      this.source.connect(this.audioContext.destination);
      this.source.addEventListener('ended', () => {
        // 음악이 자동 종료되었을 때 후처리
      });
    }
  }


  /**
   * Controller 에 의해 들어온 bgm 재생 요청을 처리
   * 이전 상태가 STOP(buffer == null) 상태이면 음원을 로드 후 재생
   * PAUSE 상태이면 현재 buffer 의 음원을 바로 재생
   * @returns {Promise<void>}
   */
  playBgm = async () => {
    let loadResult = (this.buffer) ? true : await this.loadSound();
    if(loadResult && this.buffer){
      this.playSource();
    }
  }


  /**
   * 새로운 Source 를 생성 후 연주한다.
   * Source 가 시작되면, 시작시간 및 연주상태를 업데이트한다.
   */
  playSource = () => {
    this.initSound();
    if(this.source) {
      this.source.start(0, this.soundInfo.seek / 1000);
      this.soundInfo.initTime = Date.now();
      this.setPlayingStatus(SoundPlayer.PLAYING);
    }
  }


  /**
   * Pause 상태이면 this.buffer != null
   * Stop 상태이면 this.buffer == null
   * 로 세부 상태 파악 가능.
   * @param isFullyStop
   */
  pauseBgm = (isFullyStop = false) => {
    if(this.source){
      this.source.stop();
      if(isFullyStop){
        this.buffer = null;
        this.soundInfo.seek = 0;
      }
      this.source = null;
      this.setPlayingStatus(SoundPlayer.READY);
    }
  }


  /**
   * 현재 연주 상태를 보존 한 채
   * 다음 곡으로 전환한다.
   */
  playNextBgm = async () => {
    let prevPlaying = this.buffer;
    this.getNextIndex();
    this.pauseBgm(true);
    if(prevPlaying){
      await this.playBgm();
    }
  }


  /**
   * 현재 곡의 진행 시각을 갱신한다.
   */
  setCurrentSeek = () => {
    if(this.source && this.buffer){
      let now = Date.now();
      this.soundInfo.seek += now - this.soundInfo.initTime;
      this.soundInfo.initTime = now;
    }
    return this.soundInfo.seek;
  }


  /**
   * 현재 buffer 에 담긴 곡의 길이를 반환
   * @returns {number}
   */
  setCurrentDuration = () => {
    this.soundInfo.duration = (this.buffer) ? this.buffer.duration : 0;
    return this.soundInfo.duration
  }

}

export default SoundPlayer;